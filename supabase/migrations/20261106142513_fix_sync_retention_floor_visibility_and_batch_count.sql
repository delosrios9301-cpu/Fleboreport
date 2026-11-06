drop policy if exists sync_change_log_retention_read_scoped on public.sync_change_log_retention;
create policy sync_change_log_retention_read_scoped
on public.sync_change_log_retention
for select
to authenticated
using (
  (
    entity = 'domiciles'
    and is_workspace_member(workspace_id)
  )
  or (
    entity = 'clinical_samples'
    and has_workspace_role(workspace_id, array['admin','clinician','technician','reception'])
  )
);

create or replace function private.prune_sync_change_log(
  p_retention interval default interval '90 days',
  p_batch_size integer default 10000
)
returns bigint
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_batch bigint := 0;
  v_total bigint := 0;
  v_iterations integer := 0;
begin
  if p_retention is null or p_retention < interval '7 days' then
    raise exception 'La retención mínima del registro de sincronización es de 7 días';
  end if;
  if p_batch_size is null or p_batch_size < 1000 or p_batch_size > 50000 then
    raise exception 'El tamaño de lote debe estar entre 1000 y 50000';
  end if;

  loop
    with victims as (
      select ctid, workspace_id, entity, seq
      from public.sync_change_log
      where changed_at < now() - p_retention
      order by changed_at asc, seq asc
      limit p_batch_size
      for update skip locked
    ),
    deleted as (
      delete from public.sync_change_log as log
      using victims
      where log.ctid = victims.ctid
      returning log.workspace_id, log.entity, log.seq
    ),
    floors as (
      select workspace_id, entity, max(seq) as pruned_through_seq
      from deleted
      group by workspace_id, entity
    ),
    floor_updates as (
      insert into public.sync_change_log_retention (
        workspace_id, entity, pruned_through_seq, pruned_at
      )
      select workspace_id, entity, pruned_through_seq, now()
      from floors
      on conflict (workspace_id, entity)
      do update set
        pruned_through_seq = greatest(
          public.sync_change_log_retention.pruned_through_seq,
          excluded.pruned_through_seq
        ),
        pruned_at = excluded.pruned_at
      returning 1
    )
    select count(*) into v_batch from deleted;

    v_total := v_total + v_batch;
    v_iterations := v_iterations + 1;
    exit when v_batch = 0 or v_iterations >= 20;
  end loop;

  return v_total;
end;
$function$;

revoke all on function private.prune_sync_change_log(interval, integer) from public, anon, authenticated;
