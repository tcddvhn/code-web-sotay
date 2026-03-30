import { supabase } from '../../supabase';
import { listHandbookNotices, listHandbookSectionSummaries } from './handbookContent';
import { listHandbookFeedback } from './handbookFeedback';

export async function getHandbookHomeStats() {
  const [summaries, notices] = await Promise.all([
    listHandbookSectionSummaries(),
    listHandbookNotices(4),
  ]);

  return {
    summaries,
    notices,
  };
}

async function countTable(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message || `Không thể đếm dữ liệu bảng ${table}.`);
  }

  return count || 0;
}

export async function getHandbookUsageStats() {
  const [summaries, notices, feedback, searchLogs, viewLogs, favorites, recentViews] = await Promise.all([
    listHandbookSectionSummaries(),
    listHandbookNotices(6),
    listHandbookFeedback(6),
    countTable('handbook_search_logs'),
    countTable('handbook_view_logs'),
    countTable('handbook_favorites'),
    countTable('handbook_recent_views'),
  ]);

  return {
    summaries,
    notices,
    feedback,
    counters: {
      searchLogs,
      viewLogs,
      favorites,
      recentViews,
    },
  };
}
