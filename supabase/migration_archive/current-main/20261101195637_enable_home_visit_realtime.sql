do $$
declare t text;
begin
  foreach t in array array[
    'home_visits',
    'home_visit_assignments',
    'home_visit_tests',
    'home_visit_events',
    'home_visit_notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
