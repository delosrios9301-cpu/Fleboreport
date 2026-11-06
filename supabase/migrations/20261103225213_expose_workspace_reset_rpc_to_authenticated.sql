
create or replace function public.reset_workspace_operational_data(p_workspace_id uuid,p_confirmation text)
returns table(backup_id uuid,deleted_tables integer,deleted_rows bigint,reset_epoch uuid)
language sql
security invoker
set search_path=''
as $$
  select * from private.reset_workspace_operational_data(p_workspace_id,p_confirmation);
$$;
revoke all on function public.reset_workspace_operational_data(uuid,text) from public,anon;
grant execute on function public.reset_workspace_operational_data(uuid,text) to authenticated;
