alter table public.profiles add column if not exists phone_e164 text;
alter table public.home_visit_notifications drop constraint if exists home_visit_notifications_channel_check;
alter table public.home_visit_notifications add constraint home_visit_notifications_channel_check check (channel = any (array['in_app'::text,'whatsapp'::text,'push'::text]));
alter table public.home_visit_notifications add column if not exists message_body text;
alter table public.home_visit_notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.home_visit_notifications add column if not exists updated_at timestamptz not null default now();

create table if not exists public.home_visit_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null,
 p256dh text not null,
 auth_secret text not null,
 user_agent text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, endpoint)
);
alter table public.home_visit_push_subscriptions enable row level security;
drop policy if exists home_visit_push_subscriptions_select_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_select_self on public.home_visit_push_subscriptions for select to authenticated using (user_id = auth.uid() and is_workspace_member(workspace_id));
drop policy if exists home_visit_push_subscriptions_insert_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_insert_self on public.home_visit_push_subscriptions for insert to authenticated with check (user_id = auth.uid() and is_workspace_member(workspace_id));
drop policy if exists home_visit_push_subscriptions_update_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_update_self on public.home_visit_push_subscriptions for update to authenticated using (user_id = auth.uid() and is_workspace_member(workspace_id)) with check (user_id = auth.uid() and is_workspace_member(workspace_id));
drop policy if exists home_visit_push_subscriptions_delete_self on public.home_visit_push_subscriptions;
create policy home_visit_push_subscriptions_delete_self on public.home_visit_push_subscriptions for delete to authenticated using (user_id = auth.uid() and is_workspace_member(workspace_id));

create index if not exists home_visit_push_subscriptions_user_active_idx on public.home_visit_push_subscriptions(user_id, active);
create index if not exists home_visit_notifications_visit_channel_idx on public.home_visit_notifications(home_visit_id, channel, created_at desc);