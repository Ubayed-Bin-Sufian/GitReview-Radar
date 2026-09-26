-- PR-Pulse user data. The browser uses the anon key and row-level security.
-- The daily digest Lambda uses the service role, which bypasses these policies.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  jev_api_key text,
  github_token text,
  updated_at timestamptz not null default now()
);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner text not null,
  name text not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, owner, name)
);

create table public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repositories (id) on delete cascade,
  github_number integer not null,
  title text not null,
  author text not null,
  html_url text,
  state text not null default 'open',
  diff_size integer not null default 0,
  review_status text,
  ci_build_state text,
  branch_staleness_days integer not null default 0,
  head_sha text,
  action_state text,
  actionability_score integer,
  next_step_owner text,
  evaluated_at timestamptz,
  unique (repo_id, github_number)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repositories (id) on delete cascade,
  github_number integer not null,
  title text not null,
  author text not null,
  state text not null,
  html_url text,
  updated_at timestamptz,
  unique (repo_id, github_number)
);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plugin_id text not null check (plugin_id in ('slack', 'discord', 'telegram', 'gmail')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  unique (user_id, plugin_id)
);

alter table public.user_settings enable row level security;
alter table public.repositories enable row level security;
alter table public.pull_requests enable row level security;
alter table public.issues enable row level security;
alter table public.connectors enable row level security;

create policy user_settings_own on public.user_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy repositories_own on public.repositories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy pull_requests_own on public.pull_requests
  for select
  using (
    exists (
      select 1 from public.repositories r
      where r.id = pull_requests.repo_id and r.user_id = auth.uid()
    )
  );

create policy issues_own on public.issues
  for select
  using (
    exists (
      select 1 from public.repositories r
      where r.id = issues.repo_id and r.user_id = auth.uid()
    )
  );

create policy connectors_own on public.connectors
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.repositories to authenticated;
grant select on public.pull_requests to authenticated;
grant select on public.issues to authenticated;
grant select, insert, update, delete on public.connectors to authenticated;
