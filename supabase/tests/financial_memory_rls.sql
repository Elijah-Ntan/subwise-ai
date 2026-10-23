-- Run with `supabase test db` against a disposable local Supabase instance.
-- All fixtures are rolled back. Tests actual PostgreSQL RLS, not a client mock.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users (id, email) values
 ('10000000-0000-4000-8000-000000000001', 'subwise-a@example.test'),
 ('10000000-0000-4000-8000-000000000002', 'subwise-b@example.test');
insert into public.financial_workspaces (user_id, state) values
 ('10000000-0000-4000-8000-000000000001', '{"marker":"a"}'),
 ('10000000-0000-4000-8000-000000000002', '{"marker":"b"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.financial_workspaces), 1, 'Only own workspace is visible');
select is((select state->>'marker' from public.financial_workspaces), 'a', 'Visible workspace belongs to caller');
update public.financial_workspaces set state = '{"marker":"changed"}' where user_id = '10000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.financial_workspaces where state->>'marker' = 'changed'), 0, 'Cannot update another user');
select throws_ok($$insert into public.financial_workspaces (user_id,state) values ('10000000-0000-4000-8000-000000000003','{}')$$, '42501', 'new row violates row-level security policy for table "financial_workspaces"', 'Cannot insert under another identity');
delete from public.financial_workspaces where user_id = '10000000-0000-4000-8000-000000000002';
reset role;
select is((select count(*)::integer from public.financial_workspaces where user_id = '10000000-0000-4000-8000-000000000002'), 1, 'Other user survived attempted deletion');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.financial_workspaces where user_id = '10000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.financial_workspaces), 0, 'Caller can delete their own memory');
select * from finish();
rollback;
