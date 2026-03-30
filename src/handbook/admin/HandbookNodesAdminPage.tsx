import React, { useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { HandbookContentSection, HandbookNodeRecord } from '../types';

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

  const applySelectedNode = (node: HandbookNodeRecord | null) => {
    setSelectedId(node?.id || null);
    setDraft(node ? { ...node, pdfRefs: [...node.pdfRefs] } : null);
    setStatus(null);
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
                <select value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value as HandbookContentSection })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none">
                  {SECTION_OPTIONS.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-sm font-semibold text-[var(--ink)]">
              Slug
              <input value={draft.slug || ''} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>

            <label className="block text-sm font-semibold text-[var(--ink)]">
              Tóm tắt HTML
              <textarea value={draft.summaryHtml || ''} onChange={(e) => setDraft({ ...draft, summaryHtml: e.target.value })} className="mt-2 h-28 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>

            <label className="block text-sm font-semibold text-[var(--ink)]">
              Nội dung HTML
              <textarea value={draft.detailHtml || ''} onChange={(e) => setDraft({ ...draft, detailHtml: e.target.value })} className="mt-2 h-56 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  await onSave(draft);
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
