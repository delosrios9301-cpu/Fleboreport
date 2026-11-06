create table if not exists public.workflow_sla_push_secrets (
  singleton boolean primary key default true check (singleton),
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.workflow_sla_push_secrets enable row level security;
revoke all on public.workflow_sla_push_secrets from public, anon, authenticated;
insert into public.workflow_sla_push_secrets(singleton,token)
select true, token from private.workflow_sla_push_secret where singleton=true
on conflict (singleton) do nothing;
create or replace function private.enqueue_workflow_sla_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare hook_token text;
begin
  select token into hook_token from public.workflow_sla_push_secrets where singleton=true;
  if hook_token is null then return new; end if;
  perform net.http_post(
    url := 'https://knfjwvafwbhallhpsjqe.supabase.co/functions/v1/domicilios-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-sla-hook-token',hook_token),
    body := jsonb_build_object('action','dispatch-sla','alert_id',new.id)
  );
  return new;
end;
$$;
revoke all on function private.enqueue_workflow_sla_push() from public, anon, authenticated;