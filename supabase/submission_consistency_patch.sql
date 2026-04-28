-- Patch for accepted-submission consistency after deadline/reminder rollout.
-- Run this if data overwrite requests fail with a requester_seen_at schema-cache error.

alter table public.data_overwrite_requests
  add column if not exists requester_seen_at timestamptz;

notify pgrst, 'reload schema';
