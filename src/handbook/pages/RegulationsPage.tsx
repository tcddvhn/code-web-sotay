import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, FileText, ListTree, Maximize2, Minimize2, Star, StarOff } from 'lucide-react';
import { HandbookNodeOutlineItem } from '../types';

type TreeNode = HandbookNodeOutlineItem & { children: TreeNode[] };

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

function collectExpandableIds(nodes: TreeNode[], out: Set<string>) {
  nodes.forEach((node) => {
    if (node.children.length > 0 || node.summaryHtml || node.detailHtml || node.fileUrl || node.pdfRefs.length > 0) {
      out.add(node.id);
    }
    collectExpandableIds(node.children, out);
  });
}

function getAncestors(nodes: HandbookNodeOutlineItem[], targetId?: string | null) {
  if (!targetId) {
    return [];
  }
  const path: string[] = [];
  let current = nodes.find((node) => node.id === targetId) || null;
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? (nodes.find((node) => node.id === current?.parentId) || null) : null;
  }
  return path;
}

export function RegulationsPage({
  nodes,
  selectedNodeId,
  onSelectNode,
  isFavorite = false,
  canFavorite = false,
  onToggleFavorite,
}: {
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isReadMode, setIsReadMode] = useState(false);

  const roots = useMemo(() => buildTree(nodes), [nodes]);
  const selectedPath = useMemo(() => getAncestors(nodes, selectedNodeId), [nodes, selectedNodeId]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  useEffect(() => {
    if (!selectedPath.length) {
      return;
    }
    setExpandedIds((current) => [...new Set([...current, ...selectedPath])]);
  }, [selectedPath]);

  const expandAll = () => {
    const allIds = new Set<string>();
    collectExpandableIds(roots, allIds);
    setExpandedIds([...allIds]);
  };

  const collapseAll = () => {
    setExpandedIds([]);
    setIsTocOpen(false);
  };

  const toggleNode = (nodeId: string) => {
    onSelectNode(nodeId);
    setExpandedIds((current) => (
      current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]
    ));
  };

  const getLevelClass = (level: number) => {
    if (level <= 1) return 'level-1';
    if (level === 2) return 'level-2';
    if (level === 3) return 'level-3';
    return 'level-4';
  };

  const renderActions = (node: HandbookNodeOutlineItem) => {
    if (!node.detailHtml && !node.fileUrl && !node.pdfRefs.length && !onToggleFavorite) {
      return null;
    }
    return (
      <div className="legacy-step-actions-right">
        <button
          type="button"
          className="legacy-btn-mini legacy-btn-mini-detail"
          onClick={(event) => {
            event.stopPropagation();
            onSelectNode(node.id);
          }}
        >
          <BookOpen size={14} />
          Xem chi tiết
        </button>
        {node.fileUrl ? (
          <a
            href={node.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="legacy-inline-download"
            onClick={(event) => event.stopPropagation()}
          >
            <FileText size={14} />
            {node.fileName || 'Tải về'}
          </a>
        ) : null}
        {node.pdfRefs.map((ref) => (
          <div key={`${ref.doc}-${ref.page}`} className="legacy-btn-mini legacy-btn-mini-pdf">
            {ref.doc}-Tr.{ref.page}
          </div>
        ))}
        {onToggleFavorite ? (
          <button
            type="button"
            className="legacy-btn-mini legacy-btn-mini-outline"
            disabled={!canFavorite}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(node.id);
            }}
          >
            {isFavorite && selectedNodeId === node.id ? <Star size={14} /> : <StarOff size={14} />}
            {isFavorite && selectedNodeId === node.id ? 'Đã ghim' : canFavorite ? 'Ghim' : 'Đăng nhập để ghim'}
          </button>
        ) : null}
      </div>
    );
  };

  const renderNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedIds.includes(node.id);
    const hasBody = Boolean(node.children.length || node.summaryHtml || node.detailHtml || node.fileUrl || node.pdfRefs.length);

    if (node.level === 0) {
      return (
        <div key={node.id}>
          <div className="legacy-phan-header">{node.title}</div>
          {node.summaryHtml ? (
            <div className="legacy-content-text !border-t-0 !pl-0" dangerouslySetInnerHTML={{ __html: node.summaryHtml }} />
          ) : null}
          {node.children.map((child) => renderNode(child))}
        </div>
      );
    }

    return (
      <div key={node.id} className={`legacy-step-box ${getLevelClass(node.level)} ${isExpanded ? 'active' : ''}`}>
        <div className="legacy-step-header" onClick={() => toggleNode(node.id)}>
          <div className="legacy-step-title-wrapper">
            {node.tag ? <span className="legacy-tag-label">{node.tag}</span> : null}
            {node.level >= 4 ? (
              <div className="legacy-step-number">{node.title}</div>
            ) : node.level === 1 ? (
              <div style={{ fontWeight: 'bold', color: 'var(--legacy-primary)', fontSize: '1.05rem', textTransform: 'uppercase' }}>{node.title}</div>
            ) : node.level === 2 ? (
              <div style={{ fontWeight: 700, color: '#1b5e20' }}>{node.title}</div>
            ) : (
              <div style={{ fontWeight: 700, color: '#34495e' }}>{node.title}</div>
            )}
          </div>
          {hasBody ? (
            <div className="legacy-step-icon">
              <ChevronDown size={18} />
            </div>
          ) : null}
        </div>

        <div className="legacy-step-body-wrapper">
          <div className="legacy-step-body">
            <div className="legacy-step-body-inner">
              {node.summaryHtml ? (
                <div className="legacy-content-text" dangerouslySetInnerHTML={{ __html: node.summaryHtml }} />
              ) : null}
              {node.detailHtml ? (
                <div className="legacy-content-text" dangerouslySetInnerHTML={{ __html: node.detailHtml }} />
              ) : null}
              {renderActions(node)}
              {node.children.map((child) => renderNode(child))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={isReadMode ? 'mx-auto max-w-4xl' : ''}>
      <div className="legacy-breadcrumb">
        {selectedPath.length > 0 ? (
          selectedPath.map((id, index) => {
            const node = nodes.find((item) => item.id === id);
            if (!node) return null;
            return (
              <React.Fragment key={id}>
                <button type="button" onClick={() => onSelectNode(id)}>{node.title}</button>
                {index < selectedPath.length - 1 ? <span style={{ color: '#999' }}> &gt; </span> : null}
              </React.Fragment>
            );
          })
        ) : (
          <span>Trang chủ</span>
        )}
      </div>

      <div className="legacy-top-controls">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="legacy-toggle-btn" onClick={expandAll}>
            <Maximize2 size={16} />
            Mở rộng tất cả
          </button>
          <button type="button" className="legacy-toggle-btn" onClick={collapseAll}>
            <Minimize2 size={16} />
            Thu gọn
          </button>
          <button type="button" className="legacy-toggle-btn" onClick={() => setIsTocOpen((current) => !current)}>
            <ListTree size={16} />
            Mục lục
          </button>
          <button type="button" className="legacy-toggle-btn" onClick={() => setIsReadMode((current) => !current)}>
            <BookOpen size={16} />
            {isReadMode ? 'Thoát đọc tập trung' : 'Đọc tập trung'}
          </button>
        </div>
      </div>

      {isTocOpen ? (
        <div className="legacy-recent-box">
          <div className="legacy-recent-title">
            <ListTree size={18} />
            Mục lục
          </div>
          <div className="space-y-2">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  onSelectNode(node.id);
                  setExpandedIds((current) => [...new Set([...current, ...getAncestors(nodes, node.id)])]);
                  setIsTocOpen(false);
                }}
                className="block w-full rounded-[6px] border border-[var(--legacy-border)] bg-[var(--legacy-bg-box)] px-3 py-2 text-left font-['-apple-system'] text-sm font-semibold"
                style={{ marginLeft: `${Math.min(node.level, 4) * 8}px` }}
              >
                {node.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="legacy-regulations-content">
        {roots.length > 0 ? roots.map((root) => renderNode(root)) : (
          <div className="legacy-panel p-4 text-sm text-[var(--legacy-text-muted)]">
            Chưa có dữ liệu quy định để hiển thị.
          </div>
        )}
      </div>

      {selectedNode && (selectedNode.detailHtml || selectedNode.summaryHtml) ? (
        <div className="mt-4 hidden rounded-[6px] border border-[var(--legacy-border)] bg-[var(--legacy-bg-box)] p-4 text-sm md:block">
          <div className="mb-2 text-lg font-bold text-[var(--legacy-text-main)]">{selectedNode.title}</div>
          {selectedNode.summaryHtml ? <div className="legacy-content-text !border-t-0 !pl-0" dangerouslySetInnerHTML={{ __html: selectedNode.summaryHtml }} /> : null}
          {selectedNode.detailHtml ? <div className="legacy-content-text !pl-0" dangerouslySetInnerHTML={{ __html: selectedNode.detailHtml }} /> : null}
        </div>
      ) : null}
    </div>
  );
}
