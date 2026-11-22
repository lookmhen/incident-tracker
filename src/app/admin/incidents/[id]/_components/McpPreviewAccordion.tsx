'use client';

import { useState } from 'react';
import type { IncidentDetail } from './types';
import { buildMcpPayload } from './utils';

interface McpPreviewAccordionProps {
  incident: IncidentDetail;
  resolutionText: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function McpPreviewAccordion({
  incident,
  resolutionText,
  showToast,
}: McpPreviewAccordionProps) {
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const charCount = resolutionText.length;

  const handleCopyJson = async () => {
    if (!incident) return;
    const text = JSON.stringify(buildMcpPayload(incident, resolutionText), null, 2);
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      // navigator.clipboard is unavailable over plain HTTP / LAN IPs
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {}
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Copied MCP Schema JSON payload');
    } else {
      showToast('คัดลอกไม่สำเร็จ กรุณาคัดลอกจากตัวอย่าง JSON ด้วยตนเอง', 'error');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 overflow-hidden transition-all">
      {/* Accordion Header */}
      <div
        onClick={() => setMcpExpanded(!mcpExpanded)}
        className="p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
            <span className="material-symbols-outlined text-[18px]">api</span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-headline font-bold text-slate-900">
                MCP Endpoint Schema &amp; Export
              </h3>
              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[10px] font-mono font-medium text-sky-700 border border-sky-200/80">
                mcp.incident.v1
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Standardized payload for external LLM / MCP tools
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyJson();
            }}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] text-sky-700 font-mono font-medium flex items-center gap-1 transition-colors shadow-xs"
            title="Copy incident MCP payload JSON"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <a
            href={`/api/mcp/v1/context?ticketNo=${incident.ticketNo}`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-[11px] text-slate-700 hover:text-sky-700 font-mono transition-colors shadow-xs"
            title="Open API endpoint directly"
          >
            API Link
          </a>

          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-transform">
            <span
              className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                mcpExpanded ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </div>
        </div>
      </div>

      {/* Accordion Collapsible Body */}
      {mcpExpanded && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/40">
          {/* Status metrics */}
          <div className="grid grid-cols-3 gap-2 text-center pt-2">
            <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Schema</div>
              <div className="text-xs font-bold text-sky-700 font-mono mt-0.5">mcp.incident.v1</div>
            </div>
            <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Protocol</div>
              <div className="text-xs font-bold text-slate-700 font-mono mt-0.5">REST / JSON</div>
            </div>
            <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Text Corpus</div>
              <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">{charCount} chars</div>
            </div>
          </div>

          {/* Code Payload Preview */}
          <div className="relative bg-slate-900 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner overflow-x-auto border border-slate-800">
            <pre className="text-slate-200 selection:bg-sky-700">
              {JSON.stringify(
                {
                  ...buildMcpPayload(incident, resolutionText),
                  clean_text_corpus:
                    resolutionText.length > 180 ? resolutionText.slice(0, 180) + '...' : resolutionText,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5 font-mono">
              <span className="material-symbols-outlined text-[14px] text-sky-600">sensors</span>
              <code>/api/mcp/v1/context?ticketNo={incident.ticketNo}</code>
            </span>
            <span className="text-sky-700 font-mono text-[10px] font-semibold">External Client Ready</span>
          </div>

          {/* Architecture Separation Notice */}
          <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 flex items-start gap-2.5 text-slate-600 text-[11px] leading-relaxed">
            <span className="material-symbols-outlined text-sky-600 text-[17px] shrink-0 mt-0.5">info</span>
            <div>
              <strong className="text-slate-900 font-semibold">Decoupled MCP Architecture: </strong>
              AI insights run externally via MCP clients querying the API or database directly. The web portal maintains zero heavy AI runtime overhead.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
