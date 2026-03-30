import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, ExternalLink, FileQuestion, Folder, Star, StarOff, X } from 'lucide-react';
import { HandbookContentSection, HandbookNodeOutlineItem } from '../types';

type TreeNode = HandbookNodeOutlineItem & { children: TreeNode[] };

function toPlainText(html?: string | null) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTree(nodes: HandbookNodeOutlineItem[]) {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  nodes.forEach((node) => {
    byId.set(node.id, { ...node, children: [] });
  });

  nodes.forEach((node) => {
    const current = byId.get(node.id)!;
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
}

function collectIds(node: TreeNode, out: string[]) {
  out.push(node.id);
  node.children.forEach((child) => collectIds(child, out));
}

export function LegacyListSectionPage({
  section,
  title,
  description,
  nodes,
  selectedNodeId,
  onSelectNode,
  canFavorite = false,
  isFavorite = false,
  onToggleFavorite,
}: {
  section: HandbookContentSection;
  title: string;
  description: string;
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  canFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [docTagFilter, setDocTagFilter] = useState('');
  const [openedGroupIds, setOpenedGroupIds] = useState<string[]>([]);
  const [openedItemId, setOpenedItemId] = useState<string | null>(null);

  const normalizedQuery = filterQuery.trim().toLocaleLowerCase('vi-VN');
  const roots = useMemo(() => buildTree(nodes), [nodes]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    nodes.forEach((node) => {
      (node.tag || '')
        .split(/[;,|]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => tags.add(item));
    });
    return [...tags].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [nodes]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const next = new Set(openedGroupIds);
    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    let currentParent = selectedNode?.parentId || null;
    while (currentParent) {
      next.add(currentParent);
      currentParent = nodes.find((node) => node.id === currentParent)?.parentId || null;
    }
    setOpenedGroupIds([...next]);
  }, [nodes, openedGroupIds, selectedNodeId]);

  const matchesQuery = (node: TreeNode) => {
    if (!normalizedQuery) {
      return true;
    }
    const inTitle = node.title.toLocaleLowerCase('vi-VN').includes(normalizedQuery);
    const inTag = (node.tag || '').toLocaleLowerCase('vi-VN').includes(normalizedQuery);
    const inSummary = toPlainText(node.summaryHtml).toLocaleLowerCase('vi-VN').includes(normalizedQuery);
    return inTitle || inTag || inSummary;
  };

  const matchesDocFilter = (node: TreeNode) => {
    if (section !== 'tai-lieu' || !docTagFilter) {
      return true;
    }
    return (node.tag || '').toLocaleLowerCase('vi-VN').includes(docTagFilter.toLocaleLowerCase('vi-VN'));
  };

  const shouldShowAsItem = (node: TreeNode) => {
    if (section === 'bieu-mau' || section === 'tai-lieu') {
      return Boolean(node.fileUrl) || Boolean(node.detailHtml) || Boolean(node.summaryHtml);
    }
    return Boolean(node.detailHtml) || Boolean(node.summaryHtml) || node.children.length === 0;
  };

  const isNodeVisible = (node: TreeNode): boolean => {
    const childVisible = node.children.some(isNodeVisible);
    return (matchesQuery(node) && matchesDocFilter(node)) || childVisible;
  };

  const visibleRoots = roots.filter(isNodeVisible);
  const selectedNode = nodes.find((node) => node.id === (openedItemId || selectedNodeId || '')) || null;

  const toggleGroup = (groupId: string) => {
    setOpenedGroupIds((current) => (
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    ));
  };

  const openItem = (node: TreeNode) => {
    onSelectNode(node.id);
    setOpenedItemId(node.id);
  };

  const renderItem = (node: TreeNode) => {
    const summary = toPlainText(node.summaryHtml);
    const itemSummary = (section === 'bieu-mau' || section === 'tai-lieu') && summary ? ` - ${summary}` : '';

    return (
      <button
        key={node.id}
        type="button"
        onClick={() => openItem(node)}
        className="legacy-list-view-item w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="legacy-list-title !mb-0 flex-1 pr-2">
            <FileQuestion size={18} className="mt-[2px] shrink-0 text-[#2980b9]" />
            <span>
              {node.fileName || node.title}
              {itemSummary ? <span className="font-normal text-[var(--legacy-text-muted)]">{itemSummary}</span> : null}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            {node.fileUrl ? (
              <span className="legacy-inline-download">
                <Download size={14} />
                Tải
              </span>
            ) : null}
            {section === 'tai-lieu' && node.fileUrl ? (
              <span className="legacy-inline-download !border-[var(--legacy-border)] !text-[var(--legacy-text-main)]">
                <ExternalLink size={14} />
                Xem
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  const renderGroup = (node: TreeNode, depth: number): React.ReactNode => {
    if (!isNodeVisible(node)) {
      return null;
    }

    const visibleChildren = node.children.filter(isNodeVisible);
    const hasItem = shouldShowAsItem(node);
    const childItems = visibleChildren.map((child) => renderGroup(child, depth + 1)).filter(Boolean);

    const itemNode = hasItem ? renderItem(node) : null;
    if (visibleChildren.length === 0) {
      return itemNode;
    }

    if (depth === 0) {
      return (
        <div key={node.id} className="legacy-list-main-group">
          <div className="legacy-list-main-group-title">
            <Folder size={20} className="mt-[2px] shrink-0" />
            <span>{node.title}</span>
          </div>
          <div className="pl-[5px]">
            {itemNode}
            {childItems}
          </div>
        </div>
      );
    }

    const isOpen = openedGroupIds.includes(node.id);
    return (
      <div key={node.id} className={`legacy-list-sub-group ${depth % 2 === 0 ? 'sub-group-l3' : 'sub-group-l4'} ${isOpen ? 'open' : ''}`}>
        <div className="legacy-list-sub-group-header" onClick={() => toggleGroup(node.id)}>
          <div className="flex items-start gap-2">
            <Folder size={18} className="mt-[2px] shrink-0 text-[var(--legacy-text-muted)]" />
            <span className="leading-[1.4]">{node.title}</span>
          </div>
          <ChevronDown size={16} className="legacy-sub-group-arrow" />
        </div>
        <div className="legacy-list-sub-group-body">
          {itemNode}
          {childItems}
        </div>
      </div>
    );
  };

  const visibleCount = useMemo(() => {
    let count = 0;
    visibleRoots.forEach((root) => {
      const ids: string[] = [];
      collectIds(root, ids);
      count += ids.length;
    });
    return count;
  }, [visibleRoots]);

  return (
    <div>
      <h1 className="legacy-list-page-title">{title}</h1>
      <p className="legacy-list-page-desc">{description}</p>

      <div className="legacy-doc-filter-bar">
        {section === 'tai-lieu' ? (
          <>
            <label htmlFor="legacy-doc-filter">Lọc theo loại:</label>
            <select id="legacy-doc-filter" value={docTagFilter} onChange={(event) => setDocTagFilter(event.target.value)}>
              <option value="">Tất cả</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </>
        ) : null}
        <input
          value={filterQuery}
          onChange={(event) => setFilterQuery(event.target.value)}
          placeholder="Lọc nhanh theo tên nội dung..."
        />
      </div>

      <div className="mb-4 text-sm text-[var(--legacy-text-muted)]">
        Đang hiển thị {visibleCount} mục phù hợp.
      </div>

      <div>
        {visibleRoots.length > 0 ? visibleRoots.map((root) => renderGroup(root, 0)) : (
          <div className="legacy-panel p-4 text-sm text-[var(--legacy-text-muted)]">
            Chưa có nội dung phù hợp để hiển thị trong mục này.
          </div>
        )}
      </div>

      {selectedNode && openedItemId && (
        <div className="legacy-modal-overlay" onClick={() => setOpenedItemId(null)}>
          <div className="legacy-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="legacy-modal-header">
              <div className="min-w-0">
                <div className="truncate text-lg font-bold text-[var(--legacy-text-main)]">{selectedNode.title}</div>
                {selectedNode.tag ? <div className="mt-1 text-sm text-[var(--legacy-text-muted)]">{selectedNode.tag}</div> : null}
              </div>
              <button type="button" className="legacy-toggle-btn" onClick={() => setOpenedItemId(null)}>
                <X size={16} />
                Đóng
              </button>
            </div>
            <div className="legacy-modal-body">
              {selectedNode.summaryHtml ? (
                <div className="legacy-content-text !border-t-0 !px-0 !pt-0">
                  <div dangerouslySetInnerHTML={{ __html: selectedNode.summaryHtml }} />
                </div>
              ) : null}

              {selectedNode.detailHtml ? (
                <div className="legacy-content-text !px-0">
                  <div dangerouslySetInnerHTML={{ __html: selectedNode.detailHtml }} />
                </div>
              ) : null}

              <div className="legacy-step-actions-right !mx-0 !mb-0 !mt-4">
                <button
                  type="button"
                  className="legacy-btn-mini legacy-btn-mini-detail"
                  onClick={() => onToggleFavorite?.(selectedNode.id)}
                  disabled={!canFavorite || !onToggleFavorite}
                >
                  {isFavorite ? <Star size={14} /> : <StarOff size={14} />}
                  {isFavorite ? 'Đã ghim' : canFavorite ? 'Ghim' : 'Đăng nhập để ghim'}
                </button>
                {selectedNode.fileUrl ? (
                  <a href={selectedNode.fileUrl} target="_blank" rel="noreferrer" className="legacy-inline-download">
                    <Download size={14} />
                    {selectedNode.fileName || 'Tải về'}
                  </a>
                ) : null}
                {selectedNode.pdfRefs.map((ref) => (
                  <span key={`${ref.doc}-${ref.page}`} className="legacy-btn-mini legacy-btn-mini-pdf">
                    {ref.doc}-Tr.{ref.page}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
