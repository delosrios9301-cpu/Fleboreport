begin;
CREATE OR REPLACE FUNCTION public.archive_workspace_patient(p_workspace_id uuid, p_patient_id uuid, p_legacy_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_patient public.patients%rowtype; v_count integer;
begin
 if v_uid is null or not private.member_has_workspace_role(
   p_workspace_id,v_uid,array['admin']::text[]) then
   raise exception 'Solo el administrador puede eliminar pacientes' using errcode='42501';
 end if;
 if p_patient_id is null and nullif(btrim(p_legacy_id),'') is null then
   raise exception 'Identificador de paciente requerido' using errcode='22023';
 end if;
 select p.* into v_patient from public.patients p
 where p.workspace_id=p_workspace_id 
  and (case when p_patient_id is not null then p.id=p_patient_id
      else p.legacy_id=p_legacy_id end)
 for update;
 if not found then raise exception 'No se encontró un paciente activo. Sincroniza antes de eliminarlo.' using errcode='P0002'; end if;

 if v_patient.archived_at is not null then return true; end if;
 update public.patients set archived_at=now(),archived_by=v_uid,updated_at=now()
 where id=v_patient.id and workspace_id=p_workspace_id;
 -- Se conserva app_data y todas las atenciones vinculadas. El trigger
 -- retira los duplicados del directorio compartido, por ID y cédula.
 update public.workspace_shared_app_state s
 set state=s.state,revision=s.revision+1,updated_by=v_uid,updated_at=now()
 where s.workspace_id=p_workspace_id;
 get diagnostics v_count=row_count;
 return true;
end;
$function$;
create or replace function private.prevent_archived_patient_overwrite()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.archived_at is not null and new.archived_at is not null then
  if (to_jsonb(new)-array['updated_at','archived_at','archived_by']) is distinct from
     (to_jsonb(old)-array['updated_at','archived_at','archived_by']) then
   raise exception 'El expediente está archivado. Sincroniza antes de continuar.' using errcode='55000';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.prevent_archived_patient_overwrite() from public,anon,authenticated;
drop trigger if exists prevent_archived_patient_overwrite on public.patients;
create trigger prevent_archived_patient_overwrite before update on public.patients
for each row execute function private.prevent_archived_patient_overwrite();
commit;