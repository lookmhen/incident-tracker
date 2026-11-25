'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  buildWebhookPayload,
  DEFAULT_WEBHOOK_FIELDS,
  isForbiddenWebhookKey,
  SAMPLE_WEBHOOK_PAYLOAD,
  sanitizeStoredWebhookFields,
  validateWebhookFields,
  WEBHOOK_SOURCE_OPTIONS,
  WEBHOOK_TEMPLATE_TOKENS,
  type WebhookFieldMapping,
  type WebhookSourceKey,
} from '@/lib/webhook-fields';

interface WebhookSettings {
  isEnabled: boolean;
  webhookUrl: string;
  customFields: WebhookFieldMapping[];
}

interface SmtpSettings {
  isEnabled: boolean;
  host: string;
  port: number;
  encryption: 'STARTTLS' | 'SSL' | 'NONE';
  username: string;
  password: string;
  senderEmail: string;
  recipientEmails: string;
}

interface McpSecuritySettings {
  mcpEnabled: boolean;
  enforceApiKey: boolean;
  apiKey: string;
}

interface LogEntry {
  id: string;
  ticketNo: string | null;
  channel: string;
  destination: string;
  status: string;
  statusCode: number | null;
  payload: string | null;
  response: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function IntegrationsSecurityHubPage() {
  const [activeTab, setActiveTab] = useState<'outbound' | 'mcp' | 'logs'>('outbound');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null);

  // Settings State
  const [webhook, setWebhook] = useState<WebhookSettings>({
    isEnabled: true,
    webhookUrl: '',
    customFields: DEFAULT_WEBHOOK_FIELDS.map((f) => ({ ...f })),
  });
  const [savedWebhookSnapshot, setSavedWebhookSnapshot] = useState<string>('');
  const [smtp, setSmtp] = useState<SmtpSettings>({
    isEnabled: false,
    host: 'smtp.office365.com',
    port: 587,
    encryption: 'STARTTLS',
    username: '',
    password: '',
    senderEmail: '',
    recipientEmails: '',
  });
  const [mcpSec, setMcpSec] = useState<McpSecuritySettings>({
    mcpEnabled: true,
    enforceApiKey: false,
    apiKey: '',
  });

  // Code Snippets Sub-Tab & Collapse state
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [codeLang, setCodeLang] = useState<'curl' | 'python' | 'js' | 'mcp' | 'patch' | 'inbound'>('curl');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [unresolvedFailedCount, setUnresolvedFailedCount] = useState(0);
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [inspectLog, setInspectLog] = useState<LogEntry | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);

  const formatJsonSafe = (raw: string | null) => {
    if (!raw) return '-';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  const channelDisplayLabel = (channel: string) => (channel === 'TEAMS' ? 'WEBHOOK' : channel);

  const normalizeWebhookSettings = (raw: any): WebhookSettings => ({
    isEnabled: Boolean(raw?.isEnabled),
    webhookUrl: typeof raw?.webhookUrl === 'string' ? raw.webhookUrl : '',
    customFields: sanitizeStoredWebhookFields(raw?.customFields),
  });

  const webhookKeyErrors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of webhook.customFields) {
      const k = f.key.trim();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return webhook.customFields.map((f) => {
      const k = f.key.trim();
      if (!k) return 'กรุณาระบุชื่อ Key';
      if (isForbiddenWebhookKey(k)) return `ห้ามใช้ชื่อ Key "${k}"`;
      if ((counts.get(k) || 0) > 1) return `Key "${k}" ซ้ำกัน`;
      return null;
    });
  }, [webhook.customFields]);

  const hasWebhookFieldErrors = webhook.customFields.length === 0 || webhookKeyErrors.some(Boolean);
  const hasUnsavedWebhookChanges =
    savedWebhookSnapshot !== '' && JSON.stringify(webhook) !== savedWebhookSnapshot;
  const previewJsonText = useMemo(
    () => JSON.stringify(buildWebhookPayload(SAMPLE_WEBHOOK_PAYLOAD, webhook.customFields), null, 2),
    [webhook.customFields]
  );

  const showToast = (msg: string, type: 'success' | 'error' | 'warn' = 'success') => {
    setToast({ type, text: msg });
    setTimeout(() => setToast(null), 4000);
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    return ok;
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/integrations', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const nextWebhook = normalizeWebhookSettings(data.teams);
        setWebhook(nextWebhook);
        setSavedWebhookSnapshot(JSON.stringify(nextWebhook));
        setSmtp(data.smtp);
        setMcpSec(data.mcpSecurity);
      } else if (res.status === 401) {
        showToast('เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่ที่ /admin/login', 'warn');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'ALL') params.set('channel', channelFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/integrations/logs?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setUnresolvedFailedCount(Number(data.unresolvedFailedCount) || 0);
        window.dispatchEvent(new Event('integrations-logs-updated'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchLogs();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, channelFilter, statusFilter]);

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = validateWebhookFields(webhook.customFields);
    if (!checked.valid) {
      showToast(`ตรวจสอบฟิลด์ Webhook ไม่ผ่าน: ${checked.error}`, 'error');
      return;
    }
    setSavingWebhook(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'teams',
          data: {
            isEnabled: webhook.isEnabled,
            webhookUrl: webhook.webhookUrl.trim(),
            customFields: checked.fields,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.teams) {
        const nextWebhook = normalizeWebhookSettings(data.teams);
        setWebhook(nextWebhook);
        setSavedWebhookSnapshot(JSON.stringify(nextWebhook));
        showToast('บันทึกการตั้งค่า Webhook เรียบร้อยแล้ว');
      } else {
        showToast(`บันทึกไม่สำเร็จ: ${data.error || `HTTP ${res.status}`}`, 'error');
      }
    } catch (err: any) {
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'smtp', data: smtp }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.smtp) {
        setSmtp(data.smtp);
        showToast('บันทึกการตั้งค่า SMTP เรียบร้อยแล้ว');
      } else {
        showToast(`บันทึกไม่สำเร็จ: ${data.error || `HTTP ${res.status}`}`, 'error');
      }
    } catch (err: any) {
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSaveMcpSec = async (next: Partial<McpSecuritySettings>) => {
    const prev = mcpSec;
    const merged = { ...mcpSec, ...next };
    setMcpSec(merged);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'mcp_security', data: merged }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.mcpSecurity) {
        setMcpSec(data.mcpSecurity);
        showToast('อัปเดตสถานะความปลอดภัย MCP & API เรียบร้อยแล้ว');
      } else {
        setMcpSec(prev);
        showToast(`อัปเดตไม่สำเร็จ: ${data.error || `HTTP ${res.status}`}`, 'error');
      }
    } catch (err: any) {
      setMcpSec(prev);
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    }
  };

  const handleRotateKey = async () => {
    if (!confirm('ยืนยันการสร้าง API Key ใหม่? (Key เดิมจะไม่สามารถใช้งานได้อีก)')) return;
    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate_api_key' }),
    });
    if (res.ok) {
      const data = await res.json();
      setMcpSec((prev) => ({ ...prev, apiKey: data.apiKey }));
      showToast('สร้าง API Key ใหม่เรียบร้อยแล้ว');
    }
  };

  const handleTestWebhook = async () => {
    if (hasUnsavedWebhookChanges) {
      showToast('กรุณากด Save Webhook Config ก่อนทดสอบส่ง', 'warn');
      return;
    }
    setTestingWebhook(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_teams' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(`ทดสอบไม่สำเร็จ: ${data.error || `HTTP ${res.status}`}`, 'error');
      } else if (data.simulated) {
        showToast(`โหมดจำลอง: ${data.message}`, 'warn');
      } else if (data.success) {
        showToast(`ส่ง Webhook สำเร็จ (HTTP ${data.statusCode || 200})`);
      } else {
        showToast(`Webhook ปลายทางตอบกลับ: ${data.message || 'Failed'}`, 'error');
      }
      fetchLogs();
    } catch (err: any) {
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_email' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(`ส่งอีเมลไม่สำเร็จ: ${data.message || data.error || `HTTP ${res.status}`}`, 'error');
      } else {
        showToast(data.message || 'ส่งอีเมลทดสอบเรียบร้อยแล้ว');
      }
      fetchLogs();
    } catch (err: any) {
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleResendLog = async (logId: string) => {
    setResendingId(logId);
    try {
      const res = await fetch('/api/integrations/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        showToast(`ส่งซ้ำไม่สำเร็จ: ${data.message || data.error || `HTTP ${res.status}`}`, 'error');
      } else {
        showToast(data.message || 'ส่งซ้ำเรียบร้อยแล้ว');
      }
      await fetchLogs();
    } catch (err: any) {
      showToast(`ข้อผิดพลาดเครือข่าย: ${err.message}`, 'error');
    } finally {
      setResendingId(null);
    }
  };

  const handleAcknowledgeFailed = async () => {
    try {
      const res = await fetch('/api/integrations/logs', { method: 'PATCH' });
      if (res.ok) {
        setUnresolvedFailedCount(0);
        window.dispatchEvent(new Event('integrations-logs-updated'));
        showToast('ล้างตัวเลขแจ้งเตือน Error เรียบร้อยแล้ว');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getSnippetCode = () => {
    const key = mcpSec.apiKey || 'ihub_live_xxxxxxxxxxxxxxxxxxxx';
    switch (codeLang) {
      case 'curl':
        return `curl -X GET "http://localhost:3000/api/mcp/v1/context" \\\n  -H "x-api-key: ${key}"`;
      case 'python':
        return `import requests\n\nheaders = {"x-api-key": "${key}"}\nres = requests.get("http://localhost:3000/api/mcp/v1/context", headers=headers)\nprint(res.json())`;
      case 'js':
        return `const res = await fetch("http://localhost:3000/api/mcp/v1/context", {\n  headers: { "x-api-key": "${key}" }\n});\nconst data = await res.json();`;
      case 'mcp':
        return JSON.stringify(
          {
            mcpServers: {
              'incident-hub': {
                url: 'http://localhost:3000/api/mcp/v1/context',
                headers: {
                  'x-api-key': key,
                },
              },
            },
          },
          null,
          2
        );
      case 'patch':
        return `curl -X PATCH "http://localhost:3000/api/incidents/INC-202610-001" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${key}" \\\n  -d '{"status":"RESOLVED","resolution":"Restarted service and verified connectivity."}'`;
      case 'inbound':
        return `# Inbound Incident API (from external monitoring / alerting systems)\ncurl -X POST "http://localhost:3000/api/incidents/inbound" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${key}" \\\n  -d '{\n    "title": "High CPU Alert",\n    "description": "Host db-primary CPU > 95% threshold for 5m",\n    "urgency": "HIGH",\n    "reporterName": "Zabbix Alerting Engine",\n    "department": "Infrastructure",\n    "category": "Database"\n  }'`;
    }
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center text-xs font-mono text-slate-500">
        <span className="material-symbols-outlined animate-spin text-sky-600 mr-2">sync</span>
        Loading Integrations &amp; Security Hub...
      </div>
    );
  }

  return (
    <div className="w-full bg-[#f5f7fa] min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-xs font-medium ${
              toast.type === 'error'
                ? 'bg-rose-950 text-rose-50 border-rose-500/40'
                : toast.type === 'warn'
                ? 'bg-amber-950 text-amber-50 border-amber-500/40'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                toast.type === 'error'
                  ? 'text-rose-400'
                  : toast.type === 'warn'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {toast.type === 'error' ? 'error' : toast.type === 'warn' ? 'warning' : 'check_circle'}
            </span>
            <span>{toast.text}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-headline font-semibold tracking-tight text-slate-900">
              Integrations, API &amp; Security Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              จัดการช่องทางแจ้งเตือนขาออก (Outbound Webhook / Email SMTP), ตั้งค่าความปลอดภัย API Key และตรวจสอบประวัติการส่งย้อนหลัง
              <span className="ml-2 text-xs text-slate-500 font-mono">• AES-256 config • Offline ready</span>
            </p>
          </div>
        </div>

        {/* 3 Main Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('outbound')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'outbound'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">send</span>
            <span>1. Webhook &amp; Email (Outbound)</span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'mcp'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">shield_lock</span>
            <span>2. MCP Protocol &amp; API Security</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">receipt_long</span>
            <span>3. Delivery Logs ({logs.length})</span>
            {unresolvedFailedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-600 text-white leading-none tabular-nums">
                {unresolvedFailedCount}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: OUTBOUND WEBHOOK & EMAIL */}
        {activeTab === 'outbound' && (
          <div className="space-y-6">
            {/* Card 1: Outbound Webhook + Custom Payload Fields */}
            <form
              onSubmit={handleSaveWebhook}
              className="flex flex-col bg-white rounded-2xl p-6 shadow-2xs border border-slate-200 gap-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                    <span className="material-symbols-outlined text-[22px]">webhook</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Outbound Webhook</h2>
                    <p className="text-[11px] text-slate-500">
                      ส่ง HTTP POST JSON แจ้งเตือนไปยังระบบภายนอกทันทีที่มีการแจ้งเคส
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhook.isEnabled}
                    onChange={(e) => setWebhook({ ...webhook, isEnabled: e.target.checked })}
                    className="rounded text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    {webhook.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="webhookUrl">
                  Webhook Endpoint URL
                </label>
                <input
                  id="webhookUrl"
                  type="url"
                  value={webhook.webhookUrl}
                  onChange={(e) => setWebhook({ ...webhook, webhookUrl: e.target.value })}
                  placeholder="https://... (เว้นว่างไว้ได้หากใช้ค่า env หรือปิดใช้งาน)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                />
              </div>

              {/* Field Mapping Editor + Live JSON Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Field Mapping Table */}
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="block text-xs font-semibold text-slate-800">
                        Payload Fields (กำหนด Key และข้อมูลที่ส่ง)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ปรับชื่อ key หรือสลับค่าที่ส่งเข้า endpoint ปลายทางได้ทันที
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setWebhook((prev) => ({
                            ...prev,
                            customFields: DEFAULT_WEBHOOK_FIELDS.map((f) => ({ ...f })),
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        Reset Default
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setWebhook((prev) => ({
                            ...prev,
                            customFields: [...prev.customFields, { key: '', source: 'department' }],
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        <span>Add Field</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {webhook.customFields.map((field, idx) => {
                      const keyErr = webhookKeyErrors[idx];
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                            <input
                              type="text"
                              value={field.key}
                              onChange={(e) => {
                                const next = [...webhook.customFields];
                                next[idx] = { ...next[idx], key: e.target.value };
                                setWebhook({ ...webhook, customFields: next });
                              }}
                              placeholder="JSON key (เช่น incident_type)"
                              aria-label={`JSON key row ${idx + 1}`}
                              className={`w-full px-3 py-1.5 rounded-lg border bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 transition-colors ${
                                keyErr
                                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100'
                                  : 'border-slate-200 focus:border-sky-500 focus:ring-sky-100'
                              }`}
                            />

                            <div className="relative">
                              <select
                                value={field.source}
                                onChange={(e) => {
                                  const nextSource = e.target.value as WebhookSourceKey;
                                  const next = [...webhook.customFields];
                                  next[idx] =
                                    nextSource === 'custom'
                                      ? {
                                          key: next[idx].key,
                                          source: 'custom',
                                          template: next[idx].template || '{{ticketNo}} - {{title}}',
                                        }
                                      : { key: next[idx].key, source: nextSource };
                                  setWebhook({ ...webhook, customFields: next });
                                }}
                                aria-label={`Source value row ${idx + 1}`}
                                className="w-full appearance-none bg-none px-3 py-1.5 pr-8 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                              >
                                {WEBHOOK_SOURCE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                                expand_more
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={webhook.customFields.length <= 1}
                              onClick={() =>
                                setWebhook((prev) => ({
                                  ...prev,
                                  customFields: prev.customFields.filter((_, i) => i !== idx),
                                }))
                              }
                              title="ลบฟิลด์นี้"
                              aria-label={`Remove field row ${idx + 1}`}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed justify-self-end sm:justify-self-auto"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>

                          {keyErr && <p className="text-[11px] text-rose-600 font-medium">{keyErr}</p>}

                          {field.source === 'custom' && (
                            <div className="space-y-1.5 pt-1">
                              <input
                                type="text"
                                value={field.template || ''}
                                onChange={(e) => {
                                  const next = [...webhook.customFields];
                                  next[idx] = { ...next[idx], template: e.target.value };
                                  setWebhook({ ...webhook, customFields: next });
                                }}
                                placeholder="เช่น {{reporterName}} ({{department}}) หรือข้อความคงที่"
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                              />
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-slate-500 mr-1">แทรกตัวแปร:</span>
                                {WEBHOOK_TEMPLATE_TOKENS.map((tok) => (
                                  <button
                                    key={tok}
                                    type="button"
                                    onClick={() => {
                                      const next = [...webhook.customFields];
                                      const cur = next[idx].template || '';
                                      next[idx] = {
                                        ...next[idx],
                                        template: cur ? `${cur}{{${tok}}}` : `{{${tok}}}`,
                                      };
                                      setWebhook({ ...webhook, customFields: next });
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-white hover:bg-sky-50 border border-slate-200 text-[10px] font-mono text-slate-700 hover:text-sky-700 cursor-pointer transition-colors"
                                  >
                                    {`{{${tok}}}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Live JSON Preview */}
                <div className="lg:col-span-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">Live JSON Preview</span>
                    <span className="text-[10px] font-mono text-slate-500">HTTP POST body</span>
                  </div>
                  <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-80 border border-slate-800">
                    {previewJsonText}
                  </pre>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook || hasUnsavedWebhookChanges}
                    title={hasUnsavedWebhookChanges ? 'กรุณากด Save Webhook Config ก่อนทดสอบส่ง' : undefined}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    <span>{testingWebhook ? 'Sending...' : 'Send Test Ping'}</span>
                  </button>
                  {hasUnsavedWebhookChanges && (
                    <span className="text-[11px] text-amber-700 font-medium">
                      มีการแก้ไขที่ยังไม่บันทึก (Save ก่อนทดสอบส่ง)
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingWebhook || hasWebhookFieldErrors}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${savingWebhook ? 'animate-spin' : ''}`}>
                    {savingWebhook ? 'sync' : 'save'}
                  </span>
                  <span>{savingWebhook ? 'Saving...' : 'Save Webhook Config'}</span>
                </button>
              </div>
            </form>

            {/* Card 2: Admin Email SMTP Relay */}
            <form
              onSubmit={handleSaveSmtp}
              className="flex flex-col bg-white rounded-2xl p-6 shadow-2xs border border-slate-200 gap-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                    <span className="material-symbols-outlined text-[22px]">mail</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Admin Email Alert (SMTP Relay)</h2>
                    <p className="text-[11px] text-slate-500">
                      ส่งอีเมลแจ้งเตือนแอดมินพร้อมลิงก์เปิดดูรูปภาพและปุ่มจัดการเคส
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtp.isEnabled}
                    onChange={(e) => setSmtp({ ...smtp, isEnabled: e.target.checked })}
                    className="rounded text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    {smtp.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1 space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">SMTP Host</label>
                    <input
                      type="text"
                      value={smtp.host}
                      onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                      placeholder="smtp.office365.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">Port</label>
                    <input
                      type="number"
                      value={smtp.port}
                      onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
                      placeholder="587"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">Encryption</label>
                    <div className="relative">
                      <select
                        value={smtp.encryption}
                        onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value as any })}
                        className="w-full appearance-none bg-none px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 cursor-pointer focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                      >
                        <option value="STARTTLS">STARTTLS (587)</option>
                        <option value="SSL">SSL/TLS (465)</option>
                        <option value="NONE">None (25)</option>
                      </select>
                      <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      SMTP Username (Auth)
                    </label>
                    <input
                      type="text"
                      value={smtp.username}
                      onChange={(e) => setSmtp({ ...smtp, username: e.target.value })}
                      placeholder="svc-smtp หรือ user@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Sender Email (From)
                    </label>
                    <input
                      type="email"
                      value={smtp.senderEmail}
                      onChange={(e) => setSmtp({ ...smtp, senderEmail: e.target.value })}
                      placeholder="it-alert@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Password (AES-256 Masked)
                    </label>
                    <input
                      type="password"
                      value={smtp.password}
                      onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Admin Recipient Emails (คั่นด้วยลูกน้ำ , ส่งขนานหลายคนได้)
                  </label>
                  <input
                    type="text"
                    value={smtp.recipientEmails}
                    onChange={(e) => setSmtp({ ...smtp, recipientEmails: e.target.value })}
                    placeholder="admin@company.com, helpdesk-lead@company.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
                  />
                </div>
              </div>

              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testingEmail}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
                  <span>{testingEmail ? 'Sending...' : 'Send Test Email'}</span>
                </button>

                <button
                  type="submit"
                  disabled={savingSmtp}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${savingSmtp ? 'animate-spin' : ''}`}>
                    {savingSmtp ? 'sync' : 'save'}
                  </span>
                  <span>{savingSmtp ? 'Saving...' : 'Save SMTP Config'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: MCP PROTOCOL & API SECURITY */}
        {activeTab === 'mcp' && (
          <div className="space-y-6">
            {/* API Key Authentication Card */}
            <div className="bg-white rounded-2xl p-6 shadow-2xs border border-slate-200 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                    <span className="material-symbols-outlined text-[22px]">vpn_key</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">API Key Security &amp; Access Control</h2>
                    <p className="text-[11px] text-slate-500">
                      ป้องกันการเรียกใช้ MCP Endpoints, API ส่ง Event และ API ปิดเคสจากภายนอกด้วย Header{' '}
                      <code className="font-mono text-sky-700">x-api-key</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mcpSec.mcpEnabled}
                      onChange={(e) => handleSaveMcpSec({ mcpEnabled: e.target.checked })}
                      className="rounded text-sky-600 focus:ring-sky-500 h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">Enable MCP API</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mcpSec.enforceApiKey}
                      onChange={(e) => handleSaveMcpSec({ enforceApiKey: e.target.checked })}
                      className="rounded text-sky-600 focus:ring-sky-500 h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-slate-700">Enforce API Key</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between font-mono text-xs text-slate-800">
                  <span className="truncate">{mcpSec.apiKey}</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded ml-2 shrink-0">
                    AES-256 Stored
                  </span>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(mcpSec.apiKey);
                    if (ok) {
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copiedKey ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRotateKey}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">autorenew</span>
                  <span>Rotate New Key</span>
                </button>
              </div>

              {/* Endpoints List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">GET /api/mcp/v1/km</div>
                  <p className="text-[11px] text-slate-600">
                    Endpoint หลักสำหรับ AI Agent และ Vector DB รองรับ ?format=markdown สำหรับ RAG และ ?format=json สำหรับ Client ทั่วไป
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">
                    GET /api/mcp/v1/insights
                  </div>
                  <p className="text-[11px] text-slate-600">
                    ดึงข้อมูลสรุป KPI, ปริมาณเคสแยกตามหมวดหมู่, และอัตราการแก้ปัญหา (Resolution Rate)
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">GET /api/mcp/v1/context</div>
                  <p className="text-[11px] text-slate-600">
                    Alias เชื่อมต่อย้อนหลัง ส่งข้อมูล JSON มาตรฐานไปยัง /api/mcp/v1/km โดยอัตโนมัติ
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">POST /api/events/notify</div>
                  <p className="text-[11px] text-slate-600">
                    ส่ง Event แจ้งเตือนจากระบบภายนอกผ่าน HTTP POST ไปยัง Webhook ที่ตั้งไว้
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">POST /api/incidents/inbound</div>
                  <p className="text-[11px] text-slate-600">
                    รับแจ้ง Incident จากระบบภายนอก (Zabbix, Grafana, ERP) บันทึกลง SQLite ออกเลข Ticket และยิง Webhook/Email
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">
                    PATCH /api/incidents/[ticketNo]
                  </div>
                  <p className="text-[11px] text-slate-600">
                    สั่งอัปเดตสถานะหรือปิดเคส (RESOLVED) พร้อมแนบข้อความวิธีแก้ไขปัญหาจากระบบภายนอก
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">
                    GET /api/mcp/v1/km
                  </div>
                  <p className="text-[11px] text-slate-600">
                    ส่งออกเอกสาร RCA เป็น Markdown Knowledge Base Article สำหรับ Agent RAG และ Vector Ingestion
                  </p>
                </div>
              </div>

              {/* Collapsible Sub-Tab Code Examples */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCodeExpanded(!codeExpanded)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-sky-50/60 flex items-center justify-between text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-sky-600">code</span>
                    <span>
                      ตัวอย่างการเชื่อมต่อโค้ดและแนบ Header x-api-key (External MCP Client / REST API)
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-slate-500">
                    {codeExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {codeExpanded && (
                  <div className="p-4 bg-slate-900 text-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { id: 'curl', label: 'cURL' },
                          { id: 'python', label: 'Python' },
                          { id: 'js', label: 'JavaScript' },
                          { id: 'mcp', label: 'MCP Client Config' },
                          { id: 'inbound', label: 'Inbound Incident API' },
                          { id: 'patch', label: 'PATCH Close Ticket' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setCodeLang(tab.id as any)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                              codeLang === tab.id
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(getSnippetCode() || '');
                          if (ok) {
                            setCopiedSnippet(true);
                            setTimeout(() => setCopiedSnippet(false), 2000);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-sky-400 flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedSnippet ? 'check' : 'content_copy'}
                        </span>
                        <span>{copiedSnippet ? 'Copied' : 'Copy Snippet'}</span>
                      </button>
                    </div>

                    <pre className="font-mono text-xs leading-relaxed text-slate-200 overflow-x-auto h-36 p-2">
                      {getSnippetCode()}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DELIVERY LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[140px]">
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="w-full appearance-none bg-none bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium transition-colors shadow-2xs"
                  >
                    <option value="ALL">All Channels</option>
                    <option value="TEAMS">WEBHOOK</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="CUSTOM_API">CUSTOM_API</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                    expand_more
                  </span>
                </div>

                <div className="relative min-w-[120px]">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full appearance-none bg-none bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium transition-colors shadow-2xs"
                  >
                    <option value="ALL">All Status</option>
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                    expand_more
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  เก็บย้อนหลัง 14 วัน (ลบอัตโนมัติ)
                </span>
                {unresolvedFailedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeFailed}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">notifications_off</span>
                    <span>ล้างแจ้งเตือน ({unresolvedFailedCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={fetchLogs}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px] text-sky-600">refresh</span>
                  <span>Refresh Logs</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Ticket Ref</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        ยังไม่มีประวัติการส่งแจ้งเตือน (No delivery logs recorded yet)
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-sky-50/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 tabular-nums">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {channelDisplayLabel(log.channel)}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {log.ticketNo || '-'}
                        </td>
                        <td
                          title={log.destination}
                          className="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-xs truncate"
                        >
                          {log.destination}
                        </td>
                        <td className="py-3 px-4">
                          {log.status === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold tabular-nums">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>{log.statusCode || 200} SUCCESS</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold tabular-nums">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                              <span>{log.statusCode || 500} FAILED</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectLog(log)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              disabled={resendingId === log.id}
                              onClick={() => handleResendLog(log.id)}
                              className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-200 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {resendingId === log.id ? '...' : 'Resend'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Log Inspect Modal */}
        {inspectLog && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-semibold text-slate-900 font-mono">
                  Delivery Log Inspection ({channelDisplayLabel(inspectLog.channel)}
                  {inspectLog.ticketNo ? ` • ${inspectLog.ticketNo}` : ''})
                </h3>
                <button
                  onClick={() => setInspectLog(null)}
                  className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">Destination</span>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 break-all">
                    {inspectLog.destination}
                  </div>
                </div>
                {inspectLog.errorMessage && (
                  <div>
                    <span className="text-rose-600 block text-[11px] font-sans font-semibold mb-1">Error</span>
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700">
                      {inspectLog.errorMessage}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">Payload sent</span>
                  <pre className="p-3 rounded bg-slate-900 text-slate-100 overflow-x-auto max-h-60 text-[11px]">
                    {formatJsonSafe(inspectLog.payload)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
