import { supabase } from '../../supabase';
import { HandbookContentSection, HandbookNodeRecord, HandbookNoticeItem } from '../types';

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

export async function listAllHandbookNodesForAdmin(section?: HandbookContentSection) {
  let builder = supabase.from('handbook_nodes').select('*').order('section').order('sort_order');
  if (section) {
    builder = builder.eq('section', section);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách handbook_nodes cho admin.');
  }

  return ((data || []) as HandbookNodeRow[]).map(mapNode);
}

export async function upsertHandbookNode(node: HandbookNodeRecord) {
  const payload = {
    id: node.id,
    legacy_id: node.legacyId || null,
    parent_id: node.parentId || null,
    section: node.section,
    title: node.title,
    slug: node.slug || null,
    tag: node.tag || null,
    summary_html: node.summaryHtml || null,
    detail_html: node.detailHtml || null,
    sort_order: node.sortOrder,
    level: node.level,
    file_url: node.fileUrl || null,
    file_name: node.fileName || null,
    pdf_refs: node.pdfRefs || [],
    force_accordion: node.forceAccordion,
    is_published: node.isPublished,
    updated_at: new Date().toISOString(),
    updated_by: node.updatedBy || null,
  };

  const { error } = await supabase.from('handbook_nodes').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Không thể lưu handbook node.');
  }
}

export async function deleteHandbookNode(nodeId: string) {
  const { error } = await supabase.from('handbook_nodes').delete().eq('id', nodeId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa handbook node.');
  }
}

export async function listHandbookNoticesForAdmin() {
  const { data, error } = await supabase.from('handbook_notices').select('*').order('published_at', { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(error.message || 'Không thể tải thông báo handbook cho admin.');
  }

  return ((data || []) as HandbookNoticeRow[]).map(mapNotice);
}

export async function upsertHandbookNotice(notice: HandbookNoticeItem) {
  const payload = {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    published_at: notice.publishedAt || null,
    is_published: notice.isPublished,
    updated_at: new Date().toISOString(),
    created_by: notice.createdBy || null,
  };

  const { error } = await supabase.from('handbook_notices').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Không thể lưu thông báo handbook.');
  }
}

export async function deleteHandbookNotice(noticeId: string) {
  const { error } = await supabase.from('handbook_notices').delete().eq('id', noticeId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa thông báo handbook.');
  }
}
