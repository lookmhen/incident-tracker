'use client';

import { useState, useEffect } from 'react';

interface TeamsSettings {
  isEnabled: boolean;
  webhookUrl: string;
  payloadMode: 'power_automate' | 'adaptive_card';
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
  const [toast, setToast] = useState<string | null>(null);

  // Settings State
  const [teams, setTeams] = useState<TeamsSettings>({
    isEnabled: true,
    webhookUrl: '',
    payloadMode: 'power_automate',
  });
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
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [inspectLog, setInspectLog] = useState<LogEntry | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [testingTeams, setTestingTeams] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams);
        setSmtp(data.smtp);
        setMcpSec(data.mcpSecurity);
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
      const res = await fetch(`/api/integrations/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
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

  const handleSaveTeams = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'teams', data: teams }),
    });
    if (res.ok) {
      const data = await res.json();
      setTeams(data.teams);
      showToast('บันทึกการตั้งค่า Webhook เรียบร้อยแล้ว');
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'smtp', data: smtp }),
    });
    if (res.ok) {
      const data = await res.json();
      setSmtp(data.smtp);
      showToast('บันทึกการตั้งค่า SMTP (เข้ารหัส AES-256) เรียบร้อยแล้ว');
    }
  };

  const handleSaveMcpSec = async (next: Partial<McpSecuritySettings>) => {
    const merged = { ...mcpSec, ...next };
    setMcpSec(merged);
    const res = await fetch('/api/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'mcp_security', data: merged }),
    });
    if (res.ok) {
      const data = await res.json();
      setMcpSec(data.mcpSecurity);
      showToast('อัปเดตสถานะความปลอดภัย MCP & API เรียบร้อยแล้ว');
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

  const handleTestTeams = async () => {
    setTestingTeams(true);
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_teams' }),
      });
      const data = await res.json();
      showToast(data.message || 'ส่ง Test Ping เรียบร้อยแล้ว');
      fetchLogs();
    } finally {
      setTestingTeams(false);
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
      const data = await res.json();
      showToast(data.message || 'ส่งอีเมลทดสอบเรียบร้อยแล้ว');
      fetchLogs();
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
      const data = await res.json();
      showToast(data.message || 'ส่งซ้ำเรียบร้อยแล้ว');
      fetchLogs();
    } finally {
      setResendingId(null);
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
    <div className="w-full bg-gradient-to-b from-[#f0f7fe] via-[#f8fafc] to-[#f0f7fd] min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-sky-500/30 flex items-center gap-2 text-xs font-medium">
            <span className="material-symbols-outlined text-sky-400 text-[18px]">check_circle</span>
            <span>{toast}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-700 bg-sky-100 border border-sky-200 px-2.5 py-0.5 rounded-full">
                AES-256 Encrypted Config
              </span>
              <span className="text-xs text-slate-500 font-mono">100% Offline Ready</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-headline font-bold text-slate-900">
              Integrations, API &amp; Security Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              จัดการช่องทางแจ้งเตือนขาออก (Teams / Email SMTP), ตั้งค่าความปลอดภัย API Key และตรวจสอบประวัติการส่งย้อนหลัง
            </p>
          </div>
        </div>

        {/* 3 Main Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('outbound')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'outbound'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'bg-white hover:bg-sky-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">send</span>
            <span>1. Webhook &amp; Email (Outbound)</span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'mcp'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'bg-white hover:bg-sky-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">shield_lock</span>
            <span>2. MCP Protocol &amp; API Security</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'bg-white hover:bg-sky-50 text-slate-700 border border-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">receipt_long</span>
            <span>3. Delivery Logs ({logs.length})</span>
          </button>
        </div>

        {/* TAB 1: OUTBOUND WEBHOOK & EMAIL */}
        {activeTab === 'outbound' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Card 1: Teams / Power Automate */}
            <form
              onSubmit={handleSaveTeams}
              className="bg-white rounded-2xl p-6 shadow-xs border border-sky-100 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                    <span className="material-symbols-outlined text-[22px]">webhook</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Teams / Power Automate Webhook</h2>
                    <p className="text-[11px] text-slate-500">ส่งแจ้งเตือนเข้ากลุ่มแชทอัตโนมัติทันทีที่มีการแจ้งเคส</p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={teams.isEnabled}
                    onChange={(e) => setTeams({ ...teams, isEnabled: e.target.checked })}
                    className="rounded text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    {teams.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Webhook Endpoint URL</label>
                  <input
                    type="url"
                    required
                    value={teams.webhookUrl}
                    onChange={(e) => setTeams({ ...teams, webhookUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">Payload Schema Format</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setTeams({ ...teams, payloadMode: 'power_automate' })}
                      className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        teams.payloadMode === 'power_automate'
                          ? 'bg-sky-50 border-sky-500 text-sky-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="font-bold">Power Automate JSON</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        detail, urgency, incident_type
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTeams({ ...teams, payloadMode: 'adaptive_card' })}
                      className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        teams.payloadMode === 'adaptive_card'
                          ? 'bg-sky-50 border-sky-500 text-sky-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="font-bold">Teams Adaptive Card v1.4</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Incoming Webhook Connector
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestTeams}
                  disabled={testingTeams}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>{testingTeams ? 'Sending...' : 'Send Test Ping'}</span>
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>Save Webhook Config</span>
                </button>
              </div>
            </form>

            {/* Card 2: Admin Email SMTP Relay */}
            <form
              onSubmit={handleSaveSmtp}
              className="bg-white rounded-2xl p-6 shadow-xs border border-sky-100 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                    <span className="material-symbols-outlined text-[22px]">mail</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Admin Email Alert (SMTP Relay)</h2>
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">Port</label>
                    <input
                      type="number"
                      value={smtp.port}
                      onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
                      placeholder="587"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">Encryption</label>
                    <div className="relative">
                      <select
                        value={smtp.encryption}
                        onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value as any })}
                        className="w-full appearance-none px-3 py-2 pr-8 rounded-xl border border-slate-300 text-xs bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      SMTP Username / Sender
                    </label>
                    <input
                      type="text"
                      value={smtp.username}
                      onChange={(e) =>
                        setSmtp({ ...smtp, username: e.target.value, senderEmail: e.target.value })
                      }
                      placeholder="it-alert@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testingEmail}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
                  <span>{testingEmail ? 'Sending...' : 'Send Test Email'}</span>
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>Save SMTP Config</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: MCP PROTOCOL & API SECURITY */}
        {activeTab === 'mcp' && (
          <div className="space-y-6">
            {/* API Key Authentication Card */}
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-sky-100 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                    <span className="material-symbols-outlined text-[22px]">vpn_key</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">API Key Security &amp; Access Control</h2>
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
                  onClick={() => {
                    navigator.clipboard.writeText(mcpSec.apiKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
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
                  <div className="text-xs font-mono font-bold text-sky-700">GET /api/mcp/v1/context</div>
                  <p className="text-[11px] text-slate-600">
                    ดึงข้อมูลเคสที่ผ่านการ Sanitize เป็น Clean Text สำหรับให้ระบบวิเคราะห์ภายนอกนำไปประมวลผล
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-xs font-mono font-bold text-sky-700">
                    GET /api/mcp/v1/insights &amp; /recurring
                  </div>
                  <p className="text-[11px] text-slate-600">
                    ดึงตัวเลข KPI, MTTA, Resolution Rate และการจัดกลุ่มปัญหาที่เกิดซ้ำ (Recurring Patterns)
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
                    รับแจ้ง Incident จากระบบภายนอก (Zabbix, Grafana, ERP) บันทึกลง SQLite ออกเลข Ticket และยิง Teams/Email
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
                        onClick={() => {
                          navigator.clipboard.writeText(getSnippetCode());
                          setCopiedSnippet(true);
                          setTimeout(() => setCopiedSnippet(false), 2000);
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
          <div className="bg-white rounded-2xl shadow-xs border border-sky-100 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[140px]">
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="w-full appearance-none bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium transition-colors shadow-2xs"
                  >
                    <option value="ALL">All Channels</option>
                    <option value="TEAMS">TEAMS</option>
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
                    className="w-full appearance-none bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 py-1.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium transition-colors shadow-2xs"
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

              <button
                type="button"
                onClick={fetchLogs}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[15px] text-sky-600">refresh</span>
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
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
                      <tr key={log.id} className="hover:bg-sky-50/30">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            {log.channel}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {log.ticketNo || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                          {log.destination}
                        </td>
                        <td className="py-3 px-4">
                          {log.status === 'SUCCESS' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              ● {log.statusCode || 200} SUCCESS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                              ▲ {log.statusCode || 500} FAILED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectLog(log)}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              disabled={resendingId === log.id}
                              onClick={() => handleResendLog(log.id)}
                              className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-200 text-[11px] font-semibold transition-colors cursor-pointer"
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
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-sky-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 font-mono">
                  Delivery Log Inspection ({inspectLog.channel} • {inspectLog.ticketNo})
                </h3>
                <button
                  onClick={() => setInspectLog(null)}
                  className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Destination:</span>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 break-all">
                    {inspectLog.destination}
                  </div>
                </div>
                {inspectLog.errorMessage && (
                  <div>
                    <span className="text-rose-600 block text-[10px] uppercase font-bold">Error:</span>
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700">
                      {inspectLog.errorMessage}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Payload Sent:</span>
                  <pre className="p-3 rounded bg-slate-900 text-slate-100 overflow-x-auto max-h-48 text-[11px]">
                    {inspectLog.payload || '-'}
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
