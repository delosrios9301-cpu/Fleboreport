-- Synthetic tests: a technician sees only invitation preview, then full visit after acceptance.
\set ON_ERROR_STOP on
alter table public.home_visits add column if not exists scheduled_at timestamptz default now();
alter table public.home_visits add column if not exists status text default 'pending_acceptance';
alter table public.home_visits add column if not exists priority text default 'normal';
alter table public.home_visits add column if not exists address text;
alter table public.home_visits add column if not exists patient_phone text;
alter table public.home_visit_assignments add column if not exists professional_id uuid;
create or replace function public.is_current_home_visit_assignee(
 target_workspace uuid,target_visit uuid,target_user uuid,
 allowed_status text[] default array['invited','accepted']::text[]
) returns boolean language sql stable security definer set search_path=''
as $role$
 select auth.uid() is not null and target_user=auth.uid()
 and exists(select 1 from public.home_visit_assignments a
   where a.workspace_id=target_workspace and a.home_visit_id=target_visit
   and a.assigned_user_id=auth.uid() and a.status=any(allowed_status)
   and a.id=(select a2.id from public.home_visit_assignments a2
    where a2.workspace_id=a.workspace_id and a2.home_visit_id=a.home_visit_id
    order by a2.assigned_at desc,a2.id desc limit 1));
$role$;
-- The prior integration suites use a reduced permission fixture.
create or replace function private.has_workspace_permission(
 p_workspace_id uuid,p_module_key text,p_action_key text,p_site_id uuid default null
) returns boolean language sql stable security definer set search_path=''
as $allowed$
 select (p_module_key='domicilios' and p_action_key in ('view','manage')
  and exists(select 1 from public.workspace_members wm
   where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid()
   and wm.role in ('admin','reception') and wm.active))
 or (p_module_key='patients' and p_action_key='delete'
  and exists(select 1 from public.workspace_members wm
   where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid()
    and wm.role='admin' and wm.active));
$allowed$;
alter table public.home_visits enable row level security;
grant select on public.home_visits to authenticated;
create policy test_home_visits_read_scope on public.home_visits for select to authenticated
 using (
  (private.has_workspace_permission(workspace_id,'domicilios','manage')
   and private.has_workspace_permission(workspace_id,'domicilios','view'))
  or public.is_current_home_visit_assignee(workspace_id,id,auth.uid(),array['invited','accepted']::text[])
 );
insert into public.home_visits
 (id,workspace_id,status,priority,address,patient_phone,scheduled_at)
values('e1111111-1111-4111-8111-111111111111',
       '10000000-0000-0000-0000-000000000001',
       'pending_acceptance','urgent','SECRET-ADDRESS','SECRET-PHONE',now());
insert into public.home_visit_assignments
 (id,workspace_id,home_visit_id,assigned_user_id,professional_id,status,assigned_at)
values('e2222222-2222-4222-8222-222222222222',
       '10000000-0000-0000-0000-000000000001',
       'e1111111-1111-4111-8111-111111111111',
       '00000000-0000-0000-0000-000000000004',
       null,'invited',now());
\i supabase/migrations/20261112205607_invitation_preview_rpc.sql
\i supabase/migrations/20261112205909_hide_unaccepted_home_visit_rows.sql
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $tech$
declare w uuid:='10000000-0000-0000-0000-000000000001'; x jsonb;
begin
 if (select count(*) from public.home_visits where id='e1111111-1111-4111-8111-111111111111')<>0 then
  raise exception 'Invited technician read protected visit row';end if;
 select to_jsonb(p) into x from public.list_home_visit_invitation_previews(w) p
  where p.visit_id='e1111111-1111-4111-8111-111111111111';
 if x is null or x->>'priority'<>'urgent' then
  raise exception 'Technician did not receive invitation preview';end if;
 if x ? 'address' or x ? 'patient_phone' or x ? 'patient_id'
    or x ? 'notes' or x ? 'tests' then raise exception 'Invitation preview leaked patient data';end if;
end $tech$;
reset role;
update public.home_visit_assignments set status='accepted'
 where id='e2222222-2222-4222-8222-222222222222';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $accepted$
begin
 if (select count(*) from public.home_visits where id='e1111111-1111-4111-8111-111111111111')<>1 then
  raise exception 'Accepted technician cannot read visit';end if;
 if (select count(*) from public.list_home_visit_invitation_previews('10000000-0000-0000-0000-000000000001')
   where visit_id='e1111111-1111-4111-8111-111111111111')<>0 then
  raise exception 'Accepted invitation still appears as pending';end if;
end $accepted$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $admin$
begin
 if (select count(*) from public.home_visits where id='e1111111-1111-4111-8111-111111111111')<>1 then
  raise exception 'Coordination lost access';end if;
end $admin$;
reset role;
do $anon$
begin
 if has_function_privilege('anon','public.list_home_visit_invitation_previews(uuid)','execute') then
  raise exception 'Anonymous invocation allowed';end if;
end $anon$;
\echo 'OK: preacceptance is only sanitized preview; full visit after accepted'
