-- Approved financial memory is one versioned aggregate: profile, transactions,
-- commitments, goals, preferences, and plans are saved atomically.
create table if not exists public.financial_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 400000),
  updated_at timestamptz not null default now()
);
alter table public.financial_workspaces enable row level security;
revoke all on public.financial_workspaces from anon;
grant select, insert, update, delete on public.financial_workspaces to authenticated;
create policy own_select on public.financial_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on public.financial_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on public.financial_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_delete on public.financial_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
