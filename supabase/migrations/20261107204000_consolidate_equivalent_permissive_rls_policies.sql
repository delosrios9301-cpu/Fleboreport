do $$
declare
  g record;
  v_roles text;
  v_new_name text;
  v_policy text;
begin
  for g in
    select schemaname, tablename, cmd, roles,
           array_agg(policyname order by policyname) as policy_names,
           string_agg('(' || coalesce(qual, 'true') || ')', ' OR ' order by policyname) as using_expr,
           string_agg('(' || coalesce(with_check, qual, 'true') || ')', ' OR ' order by policyname) as check_expr
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and cmd in ('SELECT','INSERT','UPDATE','DELETE')
    group by schemaname, tablename, cmd, roles
    having count(*) > 1
  loop
    select string_agg(quote_ident(r::text), ', ' order by r::text)
      into v_roles
    from unnest(g.roles) as role_names(r);

    v_new_name := 'rls_' || left(g.tablename, 30) || '_' ||
      left(md5(g.tablename || '|' || g.cmd || '|' || g.roles::text), 12);

    foreach v_policy in array g.policy_names loop
      execute format('drop policy %I on %I.%I', v_policy, g.schemaname, g.tablename);
    end loop;

    if g.cmd = 'INSERT' then
      execute format(
        'create policy %I on %I.%I as permissive for insert to %s with check (%s)',
        v_new_name, g.schemaname, g.tablename, v_roles, g.check_expr
      );
    elsif g.cmd = 'UPDATE' then
      execute format(
        'create policy %I on %I.%I as permissive for update to %s using (%s) with check (%s)',
        v_new_name, g.schemaname, g.tablename, v_roles, g.using_expr, g.check_expr
      );
    else
      execute format(
        'create policy %I on %I.%I as permissive for %s to %s using (%s)',
        v_new_name, g.schemaname, g.tablename, g.cmd, v_roles, g.using_expr
      );
    end if;
  end loop;
end $$;
