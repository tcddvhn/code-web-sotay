import { supabase } from '../../supabase';
import { getAssignmentKey } from '../../access';

type HandbookFeedbackRow = {
  id: string;
  kind: string;
  rating: string | null;
  content: string | null;
  created_at: string | null;
  created_by: string | null;
};

export type HandbookFeedbackItem = {
  id: string;
  kind: string;
  rating?: string | null;
  content?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
};

function buildFeedbackId() {
  return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapFeedback(row: HandbookFeedbackRow): HandbookFeedbackItem {
  return {
    id: row.id,
    kind: row.kind,
    rating: row.rating,
    content: row.content,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function submitHandbookFeedback({
  kind = 'feedback',
  rating,
  content,
  userEmail,
}: {
  kind?: string;
  rating?: string | null;
  content: string;
  userEmail?: string | null;
}) {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('Nội dung góp ý không được để trống.');
  }

  const payload = {
    id: buildFeedbackId(),
    kind,
    rating: rating || null,
    content: trimmedContent,
    created_by: getAssignmentKey(userEmail) || null,
  };

  const { error } = await supabase.from('handbook_feedback').insert(payload);
  if (error) {
    throw new Error(error.message || 'Không thể gửi góp ý handbook.');
  }
}

export async function listHandbookFeedback(limit = 10) {
  const { data, error } = await supabase
    .from('handbook_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Không thể tải góp ý handbook.');
  }

  return ((data || []) as HandbookFeedbackRow[]).map(mapFeedback);
}
