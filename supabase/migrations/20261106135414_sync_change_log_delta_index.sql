-- Support both latest-cursor lookup and ordered per-entity delta reads.
create index if not exists sync_change_log_workspace_entity_seq_idx
on public.sync_change_log (workspace_id, entity, seq);
drop index if exists public.sync_change_log_workspace_seq_idx;
