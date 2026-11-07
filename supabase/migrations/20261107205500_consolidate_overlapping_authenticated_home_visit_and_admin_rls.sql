do $$
declare
  t text;
  a text;
  v_count integer;
  v_using text;
  v_check text;
  v_name text;
  p record;
begin
  create temporary table _flebo_rls_merge_source on commit drop as
  select *
  from pg_policies
  where schemaname='public'
    and tablename = any(array[
      'home_visit_assignments','home_visit_events','home_visit_tests',
      'home_visits','member_permissions','user_sedes'
    ])
    and permissive='PERMISSIVE'
    and roles <@ array['public','authenticated']::name[]
    and roles && array['public','authenticated']::name[];

  -- Every PUBLIC policy being narrowed to authenticated must depend on
  -- an authenticated identity or workspace membership/permission helper.
  if exists (
    select 1 from _flebo_rls_merge_source
    where 'public'::name = any(roles)
      and coalesce(qual,'') || ' ' || coalesce(with_check,'')
        !~ '(auth\.uid|is_workspace_member|has_workspace_role|has_workspace_permission)'
  ) then
    raise exception 'Found a PUBLIC policy without an authenticated identity guard; aborting consolidation';
  end if;

  for p in select distinct tablename,policyname from _flebo_rls_merge_source loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;

  foreach t in array array[
    'home_visit_assignments','home_visit_events','home_visit_tests',
    'home_visits','member_permissions','user_sedes'
  ] loop
    foreach a in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      select count(*),
        string_agg('(' || coalesce(qual,'true') || ')',' OR ' order by policyname),
        string_agg('(' || coalesce(with_check,qual,'true') || ')',' OR ' order by policyname)
      into v_count,v_using,v_check
      from _flebo_rls_merge_source
      where tablename=t and cmd in (a,'ALL');

      if v_count > 0 then
        v_name := 'rls_final_' || t || '_' || lower(a);
        if a='INSERT' then
          execute format(
            'create policy %I on public.%I as permissive for insert to authenticated with check (%s)',
            v_name,t,v_check
          );
        elsif a='UPDATE' then
          execute format(
            'create policy %I on public.%I as permissive for update to authenticated using (%s) with check (%s)',
            v_name,t,v_using,v_check
          );
        else
          execute format(
            'create policy %I on public.%I as permissive for %s to authenticated using (%s)',
            v_name,t,a,v_using
          );
        end if;
      end if;
    end loop;
  end loop;
end $$;
