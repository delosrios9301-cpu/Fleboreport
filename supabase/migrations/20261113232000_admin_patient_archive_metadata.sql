-- Admin-only archival of patient ribbon records.
-- Applied to FleboReport Supabase on 2026-11-13.
-- Existing clinical attentions, journey entries, samples and audit logs remain intact.
alter table public.patients
 add column if not exists archived_at timestamptz,
 add column if not exists archived_by uuid references auth.users(id);
create index if not exists patients_archived_per_workspace_idx
 on public.patients(workspace_id,archived_at) where archived_at is not null;

CREATE OR REPLACE FUNCTION private.guard_patient_archive_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (tg_op='INSERT' and new.archived_at is not null)
    or (tg_op='UPDATE' and
        (old.archived_at is distinct from new.archived_at
         or old.archived_by is distinct from new.archived_by)) then
   if auth.uid() is null or not private.member_has_workspace_role(
      new.workspace_id,auth.uid(),array['admin']::text[]) then
     raise exception 'Solo el administrador puede archivar o restaurar pacientes'
       using errcode='42501';
   end if;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.protect_archived_workspace_patients()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_filtered jsonb;
begin
 if jsonb_typeof(new.state->'patients') <> 'array' then return new; end if;
 -- Las versiones antiguas de la app no pueden resucitar pacientes archivados.
 select coalesce(jsonb_agg(e.value order by e.ord),'[]'::jsonb) into v_filtered
 from jsonb_array_elements(new.state->'patients') with ordinality as e(value,ord)
 where not exists (
   select 1 from public.patients p
   where p.workspace_id=new.workspace_id and p.archived_at is not null and (
     (nullif(regexp_replace(lower(coalesce(p.document_number,'')),'[^a-z0-9]','','g'),'') is not null
       and regexp_replace(lower(coalesce(p.document_number,'')),'[^a-z0-9]','','g') =
           regexp_replace(lower(coalesce(e.value->>'document',e.value->>'cedula','')),'[^a-z0-9]','','g'))
     or (nullif(p.legacy_id,'') is not null and p.legacy_id=e.value->>'id')
     or p.id::text=e.value->>'cloudPatientId'
   )
 );
 new.state=jsonb_set(new.state,'{patients}',v_filtered,true);
 -- El backend respeta "solo administrador", incluso para permisos granulares
 -- de eliminación concedidos a roles diferentes.
 if tg_op='UPDATE' and auth.uid() is not null
   and not private.member_has_workspace_role(new.workspace_id,auth.uid(),array['admin']::text[])
   and jsonb_typeof(old.state->'patients')='array' then
   if exists (
     select 1 from jsonb_array_elements(old.state->'patients') prev(value)
     where not exists(
       select 1 from jsonb_array_elements(v_filtered) incoming(value)
       where (nullif(regexp_replace(lower(coalesce(prev.value->>'document',prev.value->>'cedula','')),'[^a-z0-9]','','g'),'') is not null
          and regexp_replace(lower(coalesce(prev.value->>'document',prev.value->>'cedula','')),'[^a-z0-9]','','g')=
              regexp_replace(lower(coalesce(incoming.value->>'document',incoming.value->>'cedula','')),'[^a-z0-9]','','g'))
          or (nullif(prev.value->>'id','') is not null and prev.value->>'id'=incoming.value->>'id')
     )
     and not exists(
       select 1 from public.patients p
       where p.workspace_id=new.workspace_id and p.archived_at is not null
        and ((nullif(p.legacy_id,'') is not null and p.legacy_id=prev.value->>'id')
           or p.id::text=prev.value->>'cloudPatientId'
           or (nullif(p.document_number,'') is not null
             and regexp_replace(lower(p.document_number),'[^a-z0-9]','','g')=
                 regexp_replace(lower(coalesce(prev.value->>'document',prev.value->>'cedula','')),'[^a-z0-9]','','g')))
     )
   ) then
     raise exception 'Solo el administrador puede retirar expedientes de pacientes'
       using errcode='42501';
   end if;
 end if;
 return new;
end;
$function$;

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
 where p.workspace_id=p_workspace_id and p.archived_at is null
  and (case when p_patient_id is not null then p.id=p_patient_id
      else p.legacy_id=p_legacy_id end)
 for update;
 if not found then raise exception 'No se encontró un paciente activo. Sincroniza antes de eliminarlo.' using errcode='P0002'; end if;

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

drop trigger if exists protect_archived_workspace_patients on public.workspace_shared_app_state;
create trigger protect_archived_workspace_patients
before insert or update of state on public.workspace_shared_app_state
for each row execute function private.protect_archived_workspace_patients();
revoke all on function private.protect_archived_workspace_patients() from public,anon,authenticated;

drop trigger if exists guard_patient_archive_columns on public.patients;
create trigger guard_patient_archive_columns
before insert or update of archived_at,archived_by on public.patients
for each row execute function private.guard_patient_archive_columns();
revoke all on function private.guard_patient_archive_columns() from public,anon,authenticated;

drop policy if exists patients_admin_only_delete_guard on public.patients;
create policy patients_admin_only_delete_guard on public.patients
as restrictive for delete to authenticated
using (private.member_has_workspace_role(workspace_id,(select auth.uid()),array['admin']::text[]));
revoke all on function public.archive_workspace_patient(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.archive_workspace_patient(uuid,uuid,text) to authenticated;
comment on function public.archive_workspace_patient(uuid,uuid,text) is
'Archiva pacientes para el administrador conservando atenciones, pruebas, historial y auditoría.';
