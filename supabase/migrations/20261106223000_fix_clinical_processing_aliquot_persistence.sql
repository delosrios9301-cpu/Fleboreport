-- Persist aliquot counts in the authorized processing-start transition.
-- This changes function logic only; it does not update or delete existing sample rows.
begin;
do $migration$
declare
  v_def text;
  v_old text := $old$processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,
 processed_by=$old$;
  v_new text := $new$processing_started_at=case when p_next_status='PROCESANDO' then now() else processing_started_at end,
 primary_aliquots=case when p_next_status='PROCESANDO' then p_primary_aliquots else primary_aliquots end,
 backup_aliquots=case when p_next_status='PROCESANDO' then p_backup_aliquots else backup_aliquots end,
 processed_by=$new$;
begin
  v_def := pg_get_functiondef('public.transition_clinical_sample(uuid,text,text,integer,integer,uuid,uuid)'::regprocedure);
  if position('primary_aliquots=case when p_next_status=' in v_def) > 0
     and position('backup_aliquots=case when p_next_status=' in v_def) > 0 then
    raise notice 'Aliquot persistence is already present; no change needed';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'Expected processing_started_at update fragment was not found; function left unchanged';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end
$migration$;
commit;
