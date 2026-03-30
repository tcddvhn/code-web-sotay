import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { HandbookContentSection, HandbookNodeRecord, HandbookPdfRef } from '../types';

const SECTION_OPTIONS: HandbookContentSection[] = ['quy-dinh', 'hoi-dap', 'bieu-mau', 'tai-lieu'];

function createDraft(section: HandbookContentSection): HandbookNodeRecord {
  const now = new Date().toISOString();
  return {
    id: `handbook_${Date.now()}`,
    section,
    title: '',
    slug: '',
    tag: '',
    summaryHtml: '',
    detailHtml: '',
    sortOrder: 0,
    level: 0,
    fileUrl: '',
    fileName: '',
    pdfRefs: [],
    forceAccordion: false,
    isPublished: true,
    createdAt: now,
    updatedAt: now,
    updatedBy: null,
  };
}

function createEmptyPdfRef(): HandbookPdfRef {
  return {
    doc: '',
    page: 1,
  };
}

export function HandbookNodesAdminPage({
  nodes,
  onSave,
  onDelete,
}: {
  nodes: HandbookNodeRecord[];
  onSave: (node: HandbookNodeRecord) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.id || null);
  const [draft, setDraft] = useState<HandbookNodeRecord | null>(nodes[0] || null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) || null, [nodes, selectedId]);

  const descendantIds = useMemo(() => {
    if (!selectedNode) {
      return new Set<string>();
    }

    const byParent = new Map<string | null, HandbookNodeRecord[]>();
    nodes.forEach((node) => {
      const key = node.parentId || null;
      const current = byParent.get(key) || [];
      current.push(node);
      byParent.set(key, current);
    });

    const collected = new Set<string>();
    const walk = (parentId: string) => {
      const children = byParent.get(parentId) || [];
      children.forEach((child) => {
        if (!collected.has(child.id)) {
          collected.add(child.id);
          walk(child.id);
        }
      });
    };
    walk(selectedNode.id);
    return collected;
  }, [nodes, selectedNode]);

  const availableParents = useMemo(() => {
    if (!draft) {
      return [] as HandbookNodeRecord[];
    }

    return nodes.filter((node) => {
      if (node.section !== draft.section) {
        return false;
      }
      if (node.id === draft.id) {
        return false;
      }
      if (descendantIds.has(node.id)) {
        return false;
      }
      return true;
    });
  }, [descendantIds, draft, nodes]);

  useEffect(() => {
    if (!draft || !selectedId) {
      return;
    }

    const updatedNode = nodes.find((node) => node.id === selectedId);
    if (updatedNode) {
      setDraft({ ...updatedNode, pdfRefs: [...updatedNode.pdfRefs] });
    }
  }, [nodes, selectedId]);

  const applySelectedNode = (node: HandbookNodeRecord | null) => {
    setSelectedId(node?.id || null);
    setDraft(node ? { ...node, pdfRefs: [...node.pdfRefs] } : null);
    setStatus(null);
  };

  const updateDraft = (patch: Partial<HandbookNodeRecord>) => {
    if (!draft) {
      return;
    }
    setDraft({ ...draft, ...patch });
  };

  const updateDraftSection = (section: HandbookContentSection) => {
    if (!draft) {
      return;
    }
    updateDraft({
      section,
      parentId: null,
      level: 0,
    });
  };

  const updateDraftParent = (parentId: string | null) => {
    if (!draft) {
      return;
    }

    if (!parentId) {
      updateDraft({ parentId: null, level: 0 });
      return;
    }

    const parentNode = nodes.find((node) => node.id === parentId) || null;
    updateDraft({
      parentId,
      level: parentNode ? parentNode.level + 1 : 0,
    });
  };

  const updatePdfRef = (index: number, patch: Partial<HandbookPdfRef>) => {
    if (!draft) {
      return;
    }

    const nextRefs = draft.pdfRefs.map((ref, refIndex) => (refIndex === index ? { ...ref, ...patch } : ref));
    updateDraft({ pdfRefs: nextRefs });
  };

  const addPdfRef = () => {
    if (!draft) {
      return;
    }
    updateDraft({ pdfRefs: [...draft.pdfRefs, createEmptyPdfRef()] });
  };

  const removePdfRef = (index: number) => {
    if (!draft) {
      return;
    }
    updateDraft({ pdfRefs: draft.pdfRefs.filter((_, refIndex) => refIndex !== index) });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="panel-card rounded-[28px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">handbook_nodes</div>
            <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Quản lý node</div>
          </div>
          <button type="button" onClick={() => applySelectedNode(createDraft('quy-dinh'))} className="primary-btn inline-flex items-center gap-2">
            <Plus size={15} />
            Tạo node
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => applySelectedNode(node)}
              className={`w-full rounded-[22px] border px-4 py-3 text-left ${selectedId === node.id ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--line)] bg-[var(--surface-soft)]'}`}
            >
              <div className="text-sm font-bold text-[var(--ink)]">{node.title || 'Node chưa đặt tên'}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{node.section}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card rounded-[28px] p-6 md:p-7">
        {draft ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-[var(--ink)]">
                Tiêu đề
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
              </label>
              <label className="text-sm font-semibold text-[var(--ink)]">
                Section
                <select value={draft.section} onChange={(e) => updateDraftSection(e.target.value as HandbookContentSection)} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none">
                  {SECTION_OPTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Node cha
                <select
                  value={draft.parentId || ''}
                  onChange={(e) => updateDraftParent(e.target.value || null)}
                  className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none"
                >
                  <option value="">Mục gốc</option>
                  {availableParents.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title || node.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Thứ tự hiển thị
                <input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => updateDraft({ sortOrder: Number(e.target.value) || 0 })}
                  className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Level
                <input
                  value={draft.level}
                  readOnly
                  className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[rgba(0,0,0,0.03)] px-4 py-3 outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Slug
                <input value={draft.slug || ''} onChange={(e) => updateDraft({ slug: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Tag
                <input value={draft.tag || ''} onChange={(e) => updateDraft({ tag: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-[var(--ink)]">
                File URL
                <input value={draft.fileUrl || ''} onChange={(e) => updateDraft({ fileUrl: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
              </label>
              <label className="block text-sm font-semibold text-[var(--ink)]">
                Tên file
                <input value={draft.fileName || ''} onChange={(e) => updateDraft({ fileName: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
              </label>
            </div>

            <label className="block text-sm font-semibold text-[var(--ink)]">
              Tóm tắt HTML
              <textarea value={draft.summaryHtml || ''} onChange={(e) => updateDraft({ summaryHtml: e.target.value })} className="mt-2 h-28 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>

            <label className="block text-sm font-semibold text-[var(--ink)]">
              Nội dung HTML
              <textarea value={draft.detailHtml || ''} onChange={(e) => updateDraft({ detailHtml: e.target.value })} className="mt-2 h-56 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                <input type="checkbox" checked={draft.isPublished} onChange={(e) => updateDraft({ isPublished: e.target.checked })} />
                Đang xuất bản
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                <input type="checkbox" checked={draft.forceAccordion} onChange={(e) => updateDraft({ forceAccordion: e.target.checked })} />
                Force accordion
              </label>
            </div>

            <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--ink)]">PDF refs</div>
                  <div className="mt-1 text-xs leading-6 text-[var(--ink-soft)]">Khai báo các tài liệu PDF gốc tham chiếu cho node này.</div>
                </div>
                <button type="button" onClick={addPdfRef} className="secondary-btn inline-flex items-center gap-2">
                  <Plus size={15} />
                  Thêm ref
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {draft.pdfRefs.length > 0 ? (
                  draft.pdfRefs.map((ref, index) => (
                    <div key={`${draft.id}-pdf-${index}`} className="grid gap-3 rounded-[20px] border border-[var(--line)] bg-white/70 p-3 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <input
                        value={ref.doc}
                        onChange={(e) => updatePdfRef(index, { doc: e.target.value })}
                        placeholder="Mã tài liệu, ví dụ hd02"
                        className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none"
                      />
                      <input
                        type="number"
                        min={1}
                        value={ref.page}
                        onChange={(e) => updatePdfRef(index, { page: Number(e.target.value) || 1 })}
                        className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none"
                      />
                      <button type="button" onClick={() => removePdfRef(index)} className="secondary-btn">
                        Xóa
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm leading-7 text-[var(--ink-soft)]">Node này chưa có PDF ref nào.</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  await onSave(draft);
                  setSelectedId(draft.id);
                  setStatus('Đã lưu node handbook.');
                }}
                className="primary-btn inline-flex items-center gap-2"
              >
                <Save size={15} />
                Lưu node
              </button>
              {selectedNode ? (
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete(selectedNode.id);
                    setStatus('Đã xóa node handbook.');
                    applySelectedNode(null);
                  }}
                  className="secondary-btn inline-flex items-center gap-2"
                >
                  <Trash2 size={15} />
                  Xóa node
                </button>
              ) : null}
            </div>

            {status ? <div className="text-sm text-[var(--ink-soft)]">{status}</div> : null}
          </div>
        ) : (
          <div className="text-sm leading-7 text-[var(--ink-soft)]">Chọn một node để chỉnh sửa hoặc tạo node mới.</div>
        )}
      </div>
    </div>
  );
}
