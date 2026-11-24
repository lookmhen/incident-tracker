'use client';

import { useState, type FormEvent } from 'react';

export interface RootCauseNode {
  name: string;
  children: string[];
}

export const DEFAULT_ROOT_CAUSE_TREE: RootCauseNode[] = [
  { name: 'Human', children: ['User Knowledge Gap', 'Security Control'] },
  { name: 'System', children: ['Program Defect', 'SAP Configuration', 'Procedure Gap'] },
  { name: 'Data', children: ['Master Data Quality', 'Authorization'] },
];

interface ManageRootCausesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tree: RootCauseNode[];
  onTreeUpdated: (next: RootCauseNode[]) => void;
  onDataMutated?: () => void;
}

export default function ManageRootCausesModal({
  isOpen,
  onClose,
  tree,
  onTreeUpdated,
  onDataMutated,
}: ManageRootCausesModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingParent, setEditingParent] = useState<string | null>(null);
  const [editParentName, setEditParentName] = useState('');

  const [editingChild, setEditingChild] = useState<{ parent: string; name: string } | null>(null);
  const [editChildName, setEditChildName] = useState('');

  const [newChildInputs, setNewChildInputs] = useState<Record<string, string>>({});
  const [newParentName, setNewParentName] = useState('');

  if (!isOpen) return null;

  const validateLabel = (raw: string): string | null => {
    const clean = raw.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setError('กรุณากรอกชื่อ Root Cause');
      return null;
    }
    if (clean.includes('>')) {
      setError('ห้ามใช้เครื่องหมาย ">" ในชื่อ Parent หรือ Sub-branch');
      return null;
    }
    return clean;
  };

  const mutateTree = async (
    url: string,
    init: RequestInit,
    notifyDataMutated: boolean,
    onSuccess?: () => void
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Operation failed (HTTP ${res.status})`);
        return;
      }
      if (Array.isArray(data)) {
        onTreeUpdated(data);
        onSuccess?.();
        if (notifyDataMutated) onDataMutated?.();
      } else {
        setError('Invalid response from server');
      }
    } catch (e) {
      console.error(e);
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setEditingParent(null);
    setEditingChild(null);
    onClose();
  };

  const handleAddParent = async (e: FormEvent) => {
    e.preventDefault();
    const clean = validateLabel(newParentName);
    if (!clean) return;
    await mutateTree(
      '/api/root-causes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_parent', name: clean }),
      },
      false,
      () => setNewParentName('')
    );
  };

  const handleRenameParent = async (oldName: string) => {
    const clean = validateLabel(editParentName);
    if (!clean) return;
    if (clean === oldName) {
      setEditingParent(null);
      setError(null);
      return;
    }
    await mutateTree(
      '/api/root-causes',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_parent', oldName, newName: clean }),
      },
      true,
      () => setEditingParent(null)
    );
  };

  const handleDeleteParent = async (parentName: string) => {
    if (!confirm(`ต้องการลบกลุ่มหลัก "${parentName}" และ Branch ย่อยทั้งหมดใช่ไหม?`)) return;
    await mutateTree(
      `/api/root-causes?parent=${encodeURIComponent(parentName)}`,
      { method: 'DELETE' },
      true,
      () => {
        if (editingParent === parentName) setEditingParent(null);
        if (editingChild?.parent === parentName) setEditingChild(null);
      }
    );
  };

  const handleAddChild = async (parentName: string) => {
    const clean = validateLabel(newChildInputs[parentName] || '');
    if (!clean) return;
    await mutateTree(
      '/api/root-causes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_child', parent: parentName, name: clean }),
      },
      false,
      () => setNewChildInputs((prev) => ({ ...prev, [parentName]: '' }))
    );
  };

  const handleRenameChild = async (parentName: string, oldName: string) => {
    const clean = validateLabel(editChildName);
    if (!clean) return;
    if (clean === oldName) {
      setEditingChild(null);
      setError(null);
      return;
    }
    await mutateTree(
      '/api/root-causes',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_child', parent: parentName, oldName, newName: clean }),
      },
      true,
      () => setEditingChild(null)
    );
  };

  const handleDeleteChild = async (parentName: string, childName: string) => {
    if (!confirm(`ต้องการลบ "${parentName} > ${childName}" ใช่ไหม?`)) return;
    await mutateTree(
      `/api/root-causes?parent=${encodeURIComponent(parentName)}&child=${encodeURIComponent(childName)}`,
      { method: 'DELETE' },
      true,
      () => {
        if (editingChild?.parent === parentName && editingChild?.name === childName) {
          setEditingChild(null);
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-lg border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-slate-500">troubleshoot</span>
            <div>
              <h3 className="font-headline font-semibold text-base text-slate-900">Manage Root Causes</h3>
              <p className="text-[11px] text-slate-500">
                จัดการกลุ่มหลัก (Parent) และ Branch ย่อย — การเปลี่ยนชื่อจะอัปเดต Incident ที่มีอยู่ให้อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Manage Root Causes modal"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
              <span>{error}</span>
            </span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-700 cursor-pointer"
              aria-label="Dismiss error"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          <div className="text-xs font-medium text-slate-500">
            Root Cause Tree ({tree.length} Main Groups)
          </div>

          {tree.map((node) => {
            const isEditingThisParent = editingParent === node.name;
            const childDraft = newChildInputs[node.name] || '';

            return (
              <div
                key={node.name}
                className="rounded-xl bg-slate-50/90 border border-slate-200/90 p-3.5 space-y-2.5"
              >
                {/* Parent Row */}
                {isEditingThisParent ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50/80 border border-indigo-200">
                    <input
                      type="text"
                      value={editParentName}
                      onChange={(e) => setEditParentName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRenameParent(node.name);
                        } else if (e.key === 'Escape') {
                          setEditingParent(null);
                          setError(null);
                        }
                      }}
                      placeholder="Parent group name"
                      className="flex-1 min-w-0 px-2.5 py-1 rounded-lg border border-indigo-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingParent(null);
                        setError(null);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-[11px] font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || !editParentName.trim()}
                      onClick={() => handleRenameParent(node.name)}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                      <span className="font-bold text-xs text-slate-900 truncate">{node.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 shrink-0">
                        {node.children.length} {node.children.length === 1 ? 'branch' : 'branches'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingParent(node.name);
                          setEditParentName(node.name);
                          setEditingChild(null);
                          setError(null);
                        }}
                        className="text-slate-400 hover:text-indigo-600 p-1 rounded cursor-pointer disabled:opacity-50"
                        title={`Rename ${node.name}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteParent(node.name)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer disabled:opacity-50"
                        title={`Delete ${node.name}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-branches List */}
                <div className="pl-4 border-l-2 border-indigo-100 space-y-1.5">
                  {node.children.length === 0 ? (
                    <div className="text-[11px] text-slate-400 py-0.5">
                      ยังไม่มีข้อย่อย (Sub-branch)
                    </div>
                  ) : (
                    node.children.map((child) => {
                      const isEditingThisChild =
                        editingChild?.parent === node.name && editingChild?.name === child;
                      return isEditingThisChild ? (
                        <div
                          key={child}
                          className="flex items-center gap-2 p-1.5 rounded-lg bg-sky-50 border border-sky-200"
                        >
                          <input
                            type="text"
                            value={editChildName}
                            onChange={(e) => setEditChildName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameChild(node.name, child);
                              } else if (e.key === 'Escape') {
                                setEditingChild(null);
                                setError(null);
                              }
                            }}
                            placeholder="Sub-branch name"
                            className="flex-1 min-w-0 px-2 py-1 rounded border border-sky-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingChild(null);
                              setError(null);
                            }}
                            className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-[11px] font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy || !editChildName.trim()}
                            onClick={() => handleRenameChild(node.name, child)}
                            className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div
                          key={child}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/80 text-xs"
                        >
                          <span className="text-slate-700 font-medium truncate">{child}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setEditingChild({ parent: node.name, name: child });
                                setEditChildName(child);
                                setEditingParent(null);
                                setError(null);
                              }}
                              className="text-slate-400 hover:text-sky-600 p-0.5 rounded cursor-pointer disabled:opacity-50"
                              title={`Rename ${child}`}
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteChild(node.name, child)}
                              className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer disabled:opacity-50"
                              title={`Delete ${child}`}
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Inline Add Sub-branch */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={childDraft}
                      onChange={(e) =>
                        setNewChildInputs((prev) => ({ ...prev, [node.name]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChild(node.name);
                        }
                      }}
                      placeholder="+ เพิ่มข้อย่อย (Sub-branch)..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      disabled={busy || !childDraft.trim()}
                      onClick={() => handleAddChild(node.name)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add New Main Group Form */}
        <form onSubmit={handleAddParent} className="border-t border-slate-100 pt-4 space-y-3">
          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            + Add New Main Group
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              value={newParentName}
              onChange={(e) => setNewParentName(e.target.value)}
              placeholder="e.g. Vendor, Infrastructure, Network"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !newParentName.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
            >
              {busy ? 'Saving...' : 'Add Main Group'}
            </button>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
