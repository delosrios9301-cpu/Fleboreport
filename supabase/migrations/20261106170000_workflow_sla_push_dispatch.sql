create extension if not exists pg_net with schema extensions;

create table if not exists private.workflow_sla_push_secret (
  singleton boolean primary key default true check (singleton),
  token text not null,
  created_at timestamptz not null default now()
);
revoke all on private.workflow_sla_push_secret from public, anon, authenticated;
insert into private.workflow_sla_push_secret(singleton,token)
values (true, encode(gen_random_bytes(32),'hex'))
on conflict (singleton) do nothing;

create or replace function private.enqueue_workflow_sla_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare hook_token text;
begin
  select token into hook_token from private.workflow_sla_push_secret where singleton = true;
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

drop trigger if exists workflow_sla_push_after_insert on public.workflow_sla_alerts;
create trigger workflow_sla_push_after_insert
after insert on public.workflow_sla_alerts
for each row execute function private.enqueue_workflow_sla_push();