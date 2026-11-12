-- Reliable section change tracking for FleboReport shared state (including
-- older full-state clients). Never exposes the raw table or a new RLS policy.
-- Key versions allow a client that missed several revisions to receive every
-- changed section without downloading unchanged logos/patients.
alter table public.workspace_shared_app_state
 add column if not exists key_versions jsonb not null default '{}'::jsonb;

create or replace function private.track_workspace_shared_state_keys()
returns trigger language plpgsql security definer set search_path=''
as $tracker$
declare
 v_key text;
 v_versions jsonb:=coalesce(old.key_versions,'{}'::jsonb);
begin
 if old.state is distinct from new.state then
  for v_key in
   select k from (
     select jsonb_object_keys(coalesce(old.state,'{}'::jsonb)) as k
     union
     select jsonb_object_keys(coalesce(new.state,'{}'::jsonb)) as k
   ) keys
  loop
   if old.state->v_key is distinct from new.state->v_key then
    v_versions:=jsonb_set(v_versions,array[v_key],to_jsonb(new.revision),true);
   end if;
  end loop;
 end if;
 new.key_versions:=v_versions;
 return new;
end;
$tracker$;

drop trigger if exists track_workspace_shared_state_keys
 on public.workspace_shared_app_state;
create trigger track_workspace_shared_state_keys
 before update of state on public.workspace_shared_app_state
 for each row execute function private.track_workspace_shared_state_keys();

-- Backfill metadata only. Existing clinical JSON and revision never change.
update public.workspace_shared_app_state as s
set key_versions=coalesce((
 select jsonb_object_agg(k,to_jsonb(s.revision))
 from jsonb_object_keys(s.state) as names(k)
),'{}'::jsonb)
where s.key_versions='{}'::jsonb and s.state<>'{}'::jsonb;

-- A single signed-in member can read only the sections already available to
-- their role via get_workspace_shared_app_state. No direct table grant.
create or replace function public.get_workspace_shared_app_state_delta(
 p_workspace_id uuid,p_since_revision integer
) returns table(
 revision integer,state jsonb,removed_keys text[],
 updated_at timestamptz,reset_epoch uuid,full_required boolean
)
language plpgsql security definer set search_path=''
as $delta$
declare
 v_uid uuid:=auth.uid();
 v_rev integer;
 v_state jsonb;
 v_versions jsonb;
 v_updated timestamptz;
 v_reset uuid;
 v_viewer_only boolean;
 v_reports_allowed boolean;
 v_key text;
 v_version text;
 v_delta jsonb:='{}'::jsonb;
 v_removed text[]:=array[]::text[];
begin
 if v_uid is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not private.member_has_workspace_role(
   p_workspace_id,v_uid,array['admin','clinician','reception','viewer']::text[]
 ) then raise exception 'No tienes permiso para consultar el estado compartido'; end if;

 if not exists(select 1 from public.workspace_shared_app_state s
  where s.workspace_id=p_workspace_id) then
  perform * from public.get_workspace_shared_app_state(p_workspace_id);
 end if;
 select s.revision,s.state,s.key_versions,s.updated_at,s.reset_epoch
 into v_rev,v_state,v_versions,v_updated,v_reset
 from public.workspace_shared_app_state s where s.workspace_id=p_workspace_id;
 if not found then return;end if;

 if p_since_revision is null or p_since_revision<0 or p_since_revision>v_rev then
  return query select v_rev,'{}'::jsonb,array[]::text[],v_updated,v_reset,true;
  return;
 end if;

 v_viewer_only:=private.member_has_workspace_role(
  p_workspace_id,v_uid,array['viewer']::text[])
  and not private.member_has_workspace_role(
   p_workspace_id,v_uid,array['admin','clinician','reception']::text[]);
 v_reports_allowed:=not v_viewer_only
  or private.has_workspace_permission(p_workspace_id,'reports','view');

 for v_key,v_version in select e.key,e.value
  from jsonb_each_text(coalesce(v_versions,'{}'::jsonb)) as e(key,value)
 loop
  if v_version::integer<=p_since_revision then continue;end if;
  if v_viewer_only and (not v_reports_allowed
    or v_key not in ('reportHistory','reportHistoryLogos')) then continue;end if;
  if v_state ? v_key then
   v_delta:=jsonb_set(v_delta,array[v_key],v_state->v_key,true);
  else
   v_removed:=array_append(v_removed,v_key);
  end if;
 end loop;
 return query select v_rev,v_delta,v_removed,v_updated,v_reset,false;
end;
$delta$;
revoke all on function public.get_workspace_shared_app_state_delta(uuid,integer)
 from public,anon;
grant execute on function public.get_workspace_shared_app_state_delta(uuid,integer)
 to authenticated,service_role;
