-- Deadline, submission history and scheduled reminder rollout

alter table public.projects
  add column if not exists deadline_at timestamptz;

create table if not exists public.project_unit_submission_events (
  id text primary key default ('submission_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  unit_code text not null references public.units(code) on delete cascade,
  year text not null,
  data_file_id text null references public.data_files(id) on delete set null,
  event_type text not null check (event_type in ('INITIAL_SUBMISSION', 'APPROVED_OVERWRITE')),
  submitted_at timestamptz not null,
  submitted_by jsonb null,
  approved_at timestamptz null,
  approved_by jsonb null,
  overwrite_request_id text null references public.data_overwrite_requests(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_unit_submission_events_project_year_idx
  on public.project_unit_submission_events (project_id, year);
create index if not exists project_unit_submission_events_project_unit_year_idx
  on public.project_unit_submission_events (project_id, unit_code, year);
create index if not exists project_unit_submission_events_submitted_at_idx
  on public.project_unit_submission_events (submitted_at);

create table if not exists public.app_notifications (
  id text primary key default ('notification_' || replace(gen_random_uuid()::text, '-', '')),
  notification_key text not null unique,
  recipient_auth_user_id uuid null,
  recipient_email text not null,
  recipient_display_name text null,
  kind text not null check (kind in ('PROJECT_DEADLINE_REMINDER')),
  title text not null,
  body text not null,
  project_id text null references public.projects(id) on delete cascade,
  project_name text null,
  unit_code text null references public.units(code) on delete cascade,
  year text null,
  due_at timestamptz null,
  read_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_notifications_recipient_idx
  on public.app_notifications (recipient_email, read_at, created_at desc);
create index if not exists app_notifications_kind_idx
  on public.app_notifications (kind, read_at);
create index if not exists app_notifications_project_unit_idx
  on public.app_notifications (project_id, unit_code, year);

alter table public.project_unit_submission_events enable row level security;
alter table public.app_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_unit_submission_events' and policyname = 'auth_read_submission_events'
  ) then
    create policy "auth_read_submission_events"
      on public.project_unit_submission_events
      for select
      to authenticated
      using (public.is_active_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_unit_submission_events' and policyname = 'auth_insert_submission_events'
  ) then
    create policy "auth_insert_submission_events"
      on public.project_unit_submission_events
      for insert
      to authenticated
      with check (public.is_active_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_unit_submission_events' and policyname = 'auth_update_submission_events'
  ) then
    create policy "auth_update_submission_events"
      on public.project_unit_submission_events
      for update
      to authenticated
      using (public.is_active_user())
      with check (public.is_active_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_unit_submission_events' and policyname = 'admin_delete_submission_events'
  ) then
    create policy "admin_delete_submission_events"
      on public.project_unit_submission_events
      for delete
      to authenticated
      using (public.is_admin_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_notifications' and policyname = 'auth_read_own_notifications'
  ) then
    create policy "auth_read_own_notifications"
      on public.app_notifications
      for select
      to authenticated
      using (public.is_admin_user() or recipient_email = auth.email());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_notifications' and policyname = 'auth_update_own_notifications'
  ) then
    create policy "auth_update_own_notifications"
      on public.app_notifications
      for update
      to authenticated
      using (public.is_admin_user() or recipient_email = auth.email())
      with check (public.is_admin_user() or recipient_email = auth.email());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_notifications' and policyname = 'admin_delete_notifications'
  ) then
    create policy "admin_delete_notifications"
      on public.app_notifications
      for delete
      to authenticated
      using (public.is_admin_user());
  end if;
end $$;

create or replace function public.generate_project_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.app_notifications (
    notification_key,
    recipient_auth_user_id,
    recipient_email,
    recipient_display_name,
    kind,
    title,
    body,
    project_id,
    project_name,
    unit_code,
    year,
    due_at
  )
  select
    concat(
      'PROJECT_DEADLINE_REMINDER:',
      p.id,
      ':',
      pu.unit_code,
      ':',
      to_char(timezone('Asia/Bangkok', p.deadline_at), 'YYYY-MM-DD')
    ) as notification_key,
    up.auth_user_id,
    up.email,
    up.display_name,
    'PROJECT_DEADLINE_REMINDER',
    concat('Dự án sắp đến hạn: ', p.name),
    concat(
      'Dự án "', p.name, '" sẽ đến hạn vào ngày ',
      to_char(timezone('Asia/Bangkok', p.deadline_at), 'DD/MM/YYYY'),
      '. Đơn vị của bạn chưa nộp báo cáo.'
    ),
    p.id,
    p.name,
    pu.unit_code,
    extract(year from timezone('Asia/Bangkok', p.deadline_at))::text,
    p.deadline_at
  from public.projects p
  join public.project_units pu
    on pu.project_id = p.id
  join public.user_profiles up
    on up.unit_code = pu.unit_code
   and up.role = 'unit_user'
   and coalesce(up.is_active, true)
  left join lateral (
    select event.id
    from public.project_unit_submission_events event
    where event.project_id = p.id
      and event.unit_code = pu.unit_code
      and event.year = extract(year from timezone('Asia/Bangkok', p.deadline_at))::text
    order by event.submitted_at asc, event.created_at asc
    limit 1
  ) first_submission on true
  where p.status = 'ACTIVE'
    and p.deadline_at is not null
    and timezone('Asia/Bangkok', p.deadline_at)::date = (timezone('Asia/Bangkok', now())::date + 1)
    and first_submission.id is null
  on conflict (notification_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.generate_project_deadline_reminders() to postgres, service_role;

do $$
declare
  job record;
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Không thể bật pg_cron tự động: %', sqlerrm;
  end;

  begin
    for job in
      select jobid
      from cron.job
      where jobname = 'project-deadline-reminders-daily'
    loop
      perform cron.unschedule(job.jobid);
    end loop;

    perform cron.schedule(
      'project-deadline-reminders-daily',
      '5 1 * * *',
      $cron$select public.generate_project_deadline_reminders();$cron$
    );
  exception when others then
    raise notice 'Không thể tạo lịch pg_cron tự động: %', sqlerrm;
  end;
end $$;

select public.generate_project_deadline_reminders() as inserted_reminders_preview;
