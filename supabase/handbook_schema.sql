create table if not exists handbook_nodes (
  id text primary key,
  legacy_id text,
  parent_id text references handbook_nodes(id) on delete cascade,
  section text not null check (section in ('quy-dinh', 'hoi-dap', 'bieu-mau', 'tai-lieu')),
  title text not null,
  slug text,
  tag text,
  summary_html text,
  detail_html text,
  sort_order integer not null default 0,
  level integer not null default 0,
  file_url text,
  file_name text,
  pdf_refs jsonb not null default '[]'::jsonb,
  force_accordion boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_handbook_nodes_section_sort on handbook_nodes(section, sort_order);
create index if not exists idx_handbook_nodes_parent_sort on handbook_nodes(parent_id, sort_order);
create index if not exists idx_handbook_nodes_slug on handbook_nodes(slug);

create table if not exists handbook_notices (
  id text primary key,
  title text not null,
  content text not null,
  published_at timestamptz,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);

create table if not exists handbook_feedback (
  id text primary key,
  kind text not null default 'feedback',
  rating text,
  content text,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists handbook_search_logs (
  id text primary key,
  query text not null,
  section text,
  results_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists handbook_view_logs (
  id text primary key,
  node_id text references handbook_nodes(id) on delete cascade,
  section text,
  viewer_key text,
  created_at timestamptz not null default now()
);

create table if not exists handbook_favorites (
  id text primary key,
  user_email text not null,
  node_id text not null references handbook_nodes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_handbook_favorites_user_node
  on handbook_favorites(user_email, node_id);

create table if not exists handbook_recent_views (
  id text primary key,
  user_email text not null,
  node_id text not null references handbook_nodes(id) on delete cascade,
  last_viewed_at timestamptz not null default now()
);

create unique index if not exists idx_handbook_recent_user_node
  on handbook_recent_views(user_email, node_id);

create table if not exists handbook_push_tokens (
  id text primary key,
  user_email text,
  token text not null,
  device_label text,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_handbook_push_token on handbook_push_tokens(token);

create table if not exists handbook_settings (
  id text primary key,
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table handbook_nodes enable row level security;
alter table handbook_notices enable row level security;
alter table handbook_feedback enable row level security;
alter table handbook_search_logs enable row level security;
alter table handbook_view_logs enable row level security;
alter table handbook_favorites enable row level security;
alter table handbook_recent_views enable row level security;
alter table handbook_push_tokens enable row level security;
alter table handbook_settings enable row level security;

drop policy if exists handbook_nodes_public_read on handbook_nodes;
create policy handbook_nodes_public_read on handbook_nodes
for select
using (is_published = true);

drop policy if exists handbook_nodes_admin_manage on handbook_nodes;
create policy handbook_nodes_admin_manage on handbook_nodes
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists handbook_notices_public_read on handbook_notices;
create policy handbook_notices_public_read on handbook_notices
for select
using (is_published = true);

drop policy if exists handbook_notices_admin_manage on handbook_notices;
create policy handbook_notices_admin_manage on handbook_notices
for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists handbook_feedback_insert_active on handbook_feedback;
create policy handbook_feedback_insert_active on handbook_feedback
for insert
with check (public.is_active_user());

drop policy if exists handbook_feedback_admin_read on handbook_feedback;
create policy handbook_feedback_admin_read on handbook_feedback
for select
using (public.is_admin_user());

drop policy if exists handbook_search_logs_insert_public on handbook_search_logs;
create policy handbook_search_logs_insert_public on handbook_search_logs
for insert
with check (true);

drop policy if exists handbook_search_logs_admin_read on handbook_search_logs;
create policy handbook_search_logs_admin_read on handbook_search_logs
for select
using (public.is_admin_user());

drop policy if exists handbook_view_logs_insert_public on handbook_view_logs;
create policy handbook_view_logs_insert_public on handbook_view_logs
for insert
with check (true);

drop policy if exists handbook_view_logs_admin_read on handbook_view_logs;
create policy handbook_view_logs_admin_read on handbook_view_logs
for select
using (public.is_admin_user());

drop policy if exists handbook_favorites_owner_manage on handbook_favorites;
create policy handbook_favorites_owner_manage on handbook_favorites
for all
using (auth.email() = user_email)
with check (auth.email() = user_email);

drop policy if exists handbook_recent_views_owner_manage on handbook_recent_views;
create policy handbook_recent_views_owner_manage on handbook_recent_views
for all
using (auth.email() = user_email)
with check (auth.email() = user_email);

drop policy if exists handbook_push_tokens_owner_manage on handbook_push_tokens;
create policy handbook_push_tokens_owner_manage on handbook_push_tokens
for all
using (auth.email() = user_email or public.is_admin_user())
with check (auth.email() = user_email or public.is_admin_user());

drop policy if exists handbook_settings_admin_manage on handbook_settings;
create policy handbook_settings_admin_manage on handbook_settings
for all
using (public.is_admin_user())
with check (public.is_admin_user());

