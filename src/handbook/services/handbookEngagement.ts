import { supabase } from '../../supabase';
import { getAssignmentKey } from '../../access';
import { HandbookContentSection, HandbookNodeRecord } from '../types';

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

type FavoriteJoinRow = {
  id: string;
  created_at: string | null;
  node: HandbookNodeRow | HandbookNodeRow[] | null;
};

type RecentJoinRow = {
  id: string;
  last_viewed_at: string | null;
  node: HandbookNodeRow | HandbookNodeRow[] | null;
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

function firstNode(row: HandbookNodeRow | HandbookNodeRow[] | null) {
  if (!row) {
    return null;
  }
  return Array.isArray(row) ? row[0] || null : row;
}

function getViewerKey() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const storageKey = 'handbook_viewer_key';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const generated = `viewer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

function buildFavoriteId(userEmail: string, nodeId: string) {
  return `favorite_${getAssignmentKey(userEmail)}_${nodeId}`;
}

function buildRecentId(userEmail: string, nodeId: string) {
  return `recent_${getAssignmentKey(userEmail)}_${nodeId}`;
}

function buildSearchId(query: string) {
  return `search_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${query.trim().slice(0, 16)}`;
}

function buildViewLogId(nodeId: string) {
  return `view_${nodeId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordHandbookSearchLog({
  query,
  section,
  resultsCount,
  userEmail,
}: {
  query: string;
  section?: HandbookContentSection | 'all';
  resultsCount: number;
  userEmail?: string | null;
}) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return;
  }

  const payload = {
    id: buildSearchId(trimmedQuery),
    query: trimmedQuery,
    section: section || 'all',
    results_count: resultsCount,
    created_by: getAssignmentKey(userEmail) || null,
  };

  const { error } = await supabase.from('handbook_search_logs').insert(payload);
  if (error) {
    throw new Error(error.message || 'Không thể ghi lịch sử tìm kiếm handbook.');
  }
}

export async function recordHandbookViewLog({
  nodeId,
  section,
  viewerKey,
}: {
  nodeId: string;
  section: HandbookContentSection;
  viewerKey?: string;
}) {
  const payload = {
    id: buildViewLogId(nodeId),
    node_id: nodeId,
    section,
    viewer_key: viewerKey || getViewerKey(),
  };

  const { error } = await supabase.from('handbook_view_logs').insert(payload);
  if (error) {
    throw new Error(error.message || 'Không thể ghi lịch sử xem handbook.');
  }
}

export async function upsertHandbookRecentView(userEmail: string, nodeId: string) {
  const normalizedEmail = getAssignmentKey(userEmail);
  if (!normalizedEmail) {
    return;
  }

  const payload = {
    id: buildRecentId(normalizedEmail, nodeId),
    user_email: normalizedEmail,
    node_id: nodeId,
    last_viewed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('handbook_recent_views').upsert(payload, { onConflict: 'user_email,node_id' });
  if (error) {
    throw new Error(error.message || 'Không thể cập nhật danh sách vừa xem của handbook.');
  }
}

export async function listHandbookRecentViews(userEmail: string, limit = 6) {
  const normalizedEmail = getAssignmentKey(userEmail);
  if (!normalizedEmail) {
    return [] as HandbookNodeRecord[];
  }

  const { data, error } = await supabase
    .from('handbook_recent_views')
    .select(`
      id,
      last_viewed_at,
      node:handbook_nodes(*)
    `)
    .eq('user_email', normalizedEmail)
    .order('last_viewed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách vừa xem của handbook.');
  }

  return ((data || []) as RecentJoinRow[])
    .map((row) => firstNode(row.node))
    .filter((row): row is HandbookNodeRow => !!row && (row.is_published ?? true))
    .map(mapNode);
}

export async function listHandbookFavorites(userEmail: string, limit = 8) {
  const normalizedEmail = getAssignmentKey(userEmail);
  if (!normalizedEmail) {
    return [] as HandbookNodeRecord[];
  }

  const { data, error } = await supabase
    .from('handbook_favorites')
    .select(`
      id,
      created_at,
      node:handbook_nodes(*)
    `)
    .eq('user_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách yêu thích của handbook.');
  }

  return ((data || []) as FavoriteJoinRow[])
    .map((row) => firstNode(row.node))
    .filter((row): row is HandbookNodeRow => !!row && (row.is_published ?? true))
    .map(mapNode);
}

export async function isHandbookFavorite(userEmail: string, nodeId: string) {
  const normalizedEmail = getAssignmentKey(userEmail);
  if (!normalizedEmail) {
    return false;
  }

  const { data, error } = await supabase
    .from('handbook_favorites')
    .select('id')
    .eq('user_email', normalizedEmail)
    .eq('node_id', nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Không thể kiểm tra trạng thái yêu thích của handbook.');
  }

  return Boolean(data);
}

export async function toggleHandbookFavorite(userEmail: string, nodeId: string) {
  const normalizedEmail = getAssignmentKey(userEmail);
  if (!normalizedEmail) {
    throw new Error('Cần đăng nhập để sử dụng mục yêu thích.');
  }

  const exists = await isHandbookFavorite(normalizedEmail, nodeId);
  if (exists) {
    const { error } = await supabase
      .from('handbook_favorites')
      .delete()
      .eq('user_email', normalizedEmail)
      .eq('node_id', nodeId);

    if (error) {
      throw new Error(error.message || 'Không thể bỏ mục yêu thích khỏi handbook.');
    }

    return false;
  }

  const payload = {
    id: buildFavoriteId(normalizedEmail, nodeId),
    user_email: normalizedEmail,
    node_id: nodeId,
  };

  const { error } = await supabase.from('handbook_favorites').insert(payload);
  if (error) {
    throw new Error(error.message || 'Không thể thêm mục yêu thích vào handbook.');
  }

  return true;
}
