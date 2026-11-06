-- Optimiza políticas RLS para evaluar auth.uid() una sola vez por sentencia.
-- Se conservan exactamente las condiciones de acceso existentes.
drop policy if exists home_visit_documents_insert_scoped on public.home_visit_documents;
create policy home_visit_documents_insert_scoped on public.home_visit_documents
as permissive for insert to authenticated
with check (
  is_workspace_member(workspace_id)
  and uploaded_by = (select auth.uid())
  and (
    has_workspace_role(workspace_id, array['admin'::text,'clinician'::text,'reception'::text])
    or is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
  )
);

drop policy if exists home_visit_documents_read_scoped on public.home_visit_documents;
create policy home_visit_documents_read_scoped on public.home_visit_documents
as permissive for select to authenticated
using (
  is_workspace_member(workspace_id)
  and (
    has_workspace_role(workspace_id, array['admin'::text,'clinician'::text,'reception'::text])
    or is_current_home_visit_assignee(workspace_id,home_visit_id,(select auth.uid()),array['accepted'::text])
  )
);

drop policy if exists home_visit_notifications_read_own on public.home_visit_notifications;
create policy home_visit_notifications_read_own on public.home_visit_notifications
as permissive for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists home_visit_notifications_update_own on public.home_visit_notifications;
create policy home_visit_notifications_update_own on public.home_visit_notifications
as permissive for update to authenticated
using (
  recipient_user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
)
with check (
  recipient_user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists home_visit_push_subscriptions_delete_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_delete_self on public.home_visit_push_subscriptions
as permissive for delete to authenticated
using (
  user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists home_visit_push_subscriptions_insert_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_insert_self on public.home_visit_push_subscriptions
as permissive for insert to authenticated
with check (
  user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists home_visit_push_subscriptions_select_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_select_self on public.home_visit_push_subscriptions
as permissive for select to authenticated
using (
  user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists home_visit_push_subscriptions_update_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_update_self on public.home_visit_push_subscriptions
as permissive for update to authenticated
using (
  user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
)
with check (
  user_id = (select auth.uid())
  and is_workspace_member(workspace_id)
);

drop policy if exists workspace_app_state_insert on public.workspace_app_state;
create policy workspace_app_state_insert on public.workspace_app_state
as permissive for insert to authenticated
with check (
  user_id = (select auth.uid())
  and has_workspace_role(workspace_id,array['admin'::text,'clinician'::text,'reception'::text])
);

drop policy if exists workspace_app_state_read on public.workspace_app_state;
create policy workspace_app_state_read on public.workspace_app_state
as permissive for select to authenticated
using (
  user_id = (select auth.uid())
  and has_workspace_role(workspace_id,array['admin'::text,'clinician'::text,'reception'::text,'viewer'::text])
);

drop policy if exists workspace_app_state_update on public.workspace_app_state;
create policy workspace_app_state_update on public.workspace_app_state
as permissive for update to authenticated
using (
  user_id = (select auth.uid())
  and has_workspace_role(workspace_id,array['admin'::text,'clinician'::text,'reception'::text])
)
with check (
  user_id = (select auth.uid())
  and has_workspace_role(workspace_id,array['admin'::text,'clinician'::text,'reception'::text])
);
