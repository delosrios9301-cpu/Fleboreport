
-- Ensure every workspace-scoped business table participates in the same audit stream.
do $$
declare t text;
begin
  for t in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='public'
      and c.column_name='workspace_id'
      and c.table_name not in (
        'audit_logs','workspace_app_state','role_permissions','member_permissions',
        'user_sedes','sync_devices','workspace_members','workspaces',
        'workspace_security_settings'
      )
  loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid=format('public.%I',t)::regclass
        and tgname='audit_'||t
        and not tgisinternal
    ) then
      execute format(
        'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
        t,t
      );
    end if;
  end loop;
end $$;
