import { listHandbookNotices, listHandbookSectionSummaries } from './handbookContent';

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
