import { supabase } from '../../supabase';
import {
  HandbookContentSection,
  HandbookNodeOutlineItem,
  HandbookNodeRecord,
  HandbookNoticeItem,
  HandbookSectionSummary,
} from '../types';

type HandbookNodeRow = {
  id: string;
  legacy_id: string | null;
  parent_id: string | null;
  section: HandbookContentSection;
  title: string;
  slug: string | null;
  tag: string | null;
  summary_html: string | null;
  detail_html: string | null;
  sort_order: number | null;
  level: number | null;
  file_url: string | null;
  file_name: string | null;
  pdf_refs: unknown;
  force_accordion: boolean | null;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

type HandbookNoticeRow = {
  id: string;
  title: string;
  content: string;
  published_at: string | null;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

const HANDBOOK_CONTENT_SECTIONS: HandbookContentSection[] = ['quy-dinh', 'hoi-dap', 'bieu-mau', 'tai-lieu'];

function normalizePdfRefs(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as { doc?: unknown; page?: unknown };
      const doc = typeof candidate.doc === 'string' ? candidate.doc : '';
      const page = Number(candidate.page);
      if (!doc || Number.isNaN(page) || page <= 0) {
        return null;
      }

      return { doc, page };
    })
    .filter((item): item is { doc: string; page: number } => !!item);
}

function mapNode(row: HandbookNodeRow): HandbookNodeRecord {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    parentId: row.parent_id,
    section: row.section,
    title: row.title,
    slug: row.slug,
    tag: row.tag,
    summaryHtml: row.summary_html,
    detailHtml: row.detail_html,
    sortOrder: row.sort_order ?? 0,
    level: row.level ?? 0,
    fileUrl: row.file_url,
    fileName: row.file_name,
    pdfRefs: normalizePdfRefs(row.pdf_refs),
    forceAccordion: row.force_accordion ?? false,
    isPublished: row.is_published ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapNotice(row: HandbookNoticeRow): HandbookNoticeItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    publishedAt: row.published_at,
    isPublished: row.is_published ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function sortNodes(a: HandbookNodeRecord, b: HandbookNodeRecord) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  return a.title.localeCompare(b.title, 'vi');
}

function buildOutline(nodes: HandbookNodeRecord[]) {
  const byParent = new Map<string | null, HandbookNodeRecord[]>();

  nodes.forEach((node) => {
    const key = node.parentId ?? null;
    const current = byParent.get(key) ?? [];
    current.push(node);
    byParent.set(key, current);
  });

  byParent.forEach((value) => value.sort(sortNodes));

  const outline: HandbookNodeOutlineItem[] = [];

  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    children.forEach((node) => {
      const childCount = (byParent.get(node.id) ?? []).length;
      outline.push({
        ...node,
        depth,
        childrenCount: childCount,
      });
      walk(node.id, depth + 1);
    });
  };

  walk(null, 0);
  return outline;
}

export async function listPublishedHandbookNodes() {
  const { data, error } = await supabase
    .from('handbook_nodes')
    .select('*')
    .eq('is_published', true);

  if (error) {
    throw new Error(error.message || 'Không thể tải dữ liệu Sổ tay từ Supabase.');
  }

  return ((data || []) as HandbookNodeRow[]).map(mapNode);
}

export async function listHandbookNodesBySection(section: HandbookContentSection) {
  const { data, error } = await supabase
    .from('handbook_nodes')
    .select('*')
    .eq('section', section)
    .eq('is_published', true);

  if (error) {
    throw new Error(error.message || `Không thể tải mục ${section} từ Supabase.`);
  }

  return buildOutline(((data || []) as HandbookNodeRow[]).map(mapNode));
}

export async function listHandbookNotices(limit = 5) {
  const { data, error } = await supabase
    .from('handbook_notices')
    .select('*')
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Không thể tải thông báo Sổ tay từ Supabase.');
  }

  return ((data || []) as HandbookNoticeRow[]).map(mapNotice);
}

export async function listHandbookSectionSummaries(): Promise<HandbookSectionSummary[]> {
  const nodes = await listPublishedHandbookNodes();
  return HANDBOOK_CONTENT_SECTIONS.map((section) => ({
    section,
    count: nodes.filter((node) => node.section === section).length,
  }));
}

export async function searchHandbookNodes(query: string) {
  const trimmedQuery = query.trim().toLocaleLowerCase('vi-VN');
  if (!trimmedQuery) {
    return [] as HandbookNodeOutlineItem[];
  }

  const nodes = await listPublishedHandbookNodes();
  const matched = nodes.filter((node) => {
    const haystack = [node.title, node.tag, node.summaryHtml, node.detailHtml]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi-VN');
    return haystack.includes(trimmedQuery);
  });

  return buildOutline(matched);
}
