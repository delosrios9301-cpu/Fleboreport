-- Enforce cryovial-level capacity, barcode, position and final-storage transitions.
begin;
create unique index if not exists clinical_cryovials_workspace_barcode_uidx
  on public.clinical_cryovials(workspace_id,lower(barcode));
create unique index if not exists clinical_cryovials_box_position_uidx
  on public.clinical_cryovials(workspace_id,box_id,position_no)
  where box_id is not null and position_no is not null;

create or replace function public.guard_clinical_sample_workflow()
returns trigger language plpgsql set search_path = '' as $$
declare v_expected integer; v_total integer; v_valid integer;
begin
  if tg_op = 'INSERT' then
    if new.workflow_status <> 'REGISTRADO' then raise exception 'Una muestra nueva debe iniciar en REGISTRADO'; end if;
  elsif new.workflow_status is distinct from old.workflow_status then
    if coalesce(current_setting('app.clinical_transition', true), '') <> 'on' then
      raise exception 'El estado de la muestra solo puede cambiar mediante la transición autorizada';
    end if;
    if new.workflow_status='CONGELADOR_DEFINITIVO' then
      v_expected := coalesce(new.primary_aliquots,0)+coalesce(new.backup_aliquots,0);
      select count(*),count(*) filter(where status='Almacenamiento definitivo' and box_id=new.definitive_box_id)
        into v_total,v_valid
      from public.clinical_cryovials where workspace_id=new.workspace_id and sample_id=new.id;
      if new.definitive_box_id is null or v_total<>v_expected or v_valid<>v_expected then
        raise exception 'No se puede cerrar el almacenamiento definitivo: todos los crioviales deben estar registrados y ubicados en la misma caja definitiva';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.register_clinical_cryovial(
 p_workspace_id uuid,p_sample_id uuid,p_barcode text,p_kind text,p_box_id uuid,p_position_no integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_sample public.clinical_samples%rowtype; v_box public.clinical_boxes%rowtype; v_expected integer; v_registered integer; v_id uuid;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then raise exception 'No tiene permisos para registrar crioviales'; end if;
 if p_barcode is null or length(trim(p_barcode))=0 then raise exception 'El código del criovial es obligatorio'; end if;
 if p_kind not in ('principal','backup') then raise exception 'Tipo de alícuota no válido'; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and id=p_sample_id for update;
 if not found or v_sample.workflow_status<>'ALMACENAMIENTO_TEMPORAL' then raise exception 'La muestra debe estar en almacenamiento temporal'; end if;
 select * into v_box from public.clinical_boxes where workspace_id=p_workspace_id and id=p_box_id and study_id=v_sample.study_id and storage_stage='temporal' and active for update;
 if not found or p_box_id<>v_sample.temporary_box_id then raise exception 'El criovial debe ir a la caja temporal asignada a su estudio y muestra'; end if;
 v_expected:=case when p_kind='principal' then v_sample.primary_aliquots else v_sample.backup_aliquots end;
 select count(*) into v_registered from public.clinical_cryovials where workspace_id=p_workspace_id and sample_id=p_sample_id and kind=p_kind;
 if v_expected<1 or v_registered>=v_expected then raise exception 'Ya se alcanzó la cantidad prevista de crioviales para esta categoría'; end if;
 if p_position_no is null or p_position_no<1 or p_position_no>v_box.aliquot_capacity then raise exception 'Posición de criovial fuera de capacidad'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and lower(barcode)=lower(trim(p_barcode))) then raise exception 'El código del criovial ya existe'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and box_id=p_box_id and position_no=p_position_no) then raise exception 'La posición seleccionada ya está ocupada'; end if;
 insert into public.clinical_cryovials(workspace_id,sample_id,barcode,kind,status,box_id,position_no,created_by)
 values(p_workspace_id,p_sample_id,trim(p_barcode),p_kind,'Almacenamiento temporal',p_box_id,p_position_no,v_actor)
 returning id into v_id;
 insert into public.clinical_cryovial_events(workspace_id,cryovial_id,action,from_box_id,from_position,to_box_id,to_position,actor_id,notes)
 values(p_workspace_id,v_id,'Registro en almacenamiento temporal',null,null,p_box_id,p_position_no,v_actor,'Registro de criovial');
 return jsonb_build_object('ok',true,'cryovial_id',v_id);
end;
$$;

create or replace function public.move_clinical_cryovial_to_definitive(
 p_workspace_id uuid,p_cryovial_id uuid,p_box_id uuid,p_position_no integer,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_vial public.clinical_cryovials%rowtype; v_sample public.clinical_samples%rowtype; v_box public.clinical_boxes%rowtype; v_expected integer; v_total integer; v_final_count integer;
begin
 if v_actor is null then raise exception 'Se requiere una sesión autenticada'; end if;
 if not public.has_workspace_role(p_workspace_id,array['admin','technician']) then raise exception 'No tiene permisos para trasladar crioviales'; end if;
 select * into v_vial from public.clinical_cryovials where workspace_id=p_workspace_id and id=p_cryovial_id for update;
 if not found or v_vial.status<>'Almacenamiento temporal' then raise exception 'El criovial no está en almacenamiento temporal'; end if;
 select * into v_sample from public.clinical_samples where workspace_id=p_workspace_id and id=v_vial.sample_id for update;
 if not found or v_sample.workflow_status<>'ALMACENAMIENTO_TEMPORAL' then raise exception 'La muestra no está habilitada para traslado definitivo'; end if;
 select * into v_box from public.clinical_boxes where workspace_id=p_workspace_id and id=p_box_id and study_id=v_sample.study_id and storage_stage='definitivo' and active for update;
 if not found then raise exception 'La caja definitiva no pertenece al estudio o está inactiva'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and sample_id=v_sample.id and status='Almacenamiento definitivo' and box_id<>p_box_id) then
   raise exception 'Todos los crioviales de una muestra deben quedar en la misma caja definitiva';
 end if;
 if p_position_no is null or p_position_no<1 or p_position_no>v_box.aliquot_capacity then raise exception 'Posición de criovial fuera de capacidad'; end if;
 if exists(select 1 from public.clinical_cryovials where workspace_id=p_workspace_id and box_id=p_box_id and position_no=p_position_no) then raise exception 'La posición seleccionada ya está ocupada'; end if;
 update public.clinical_cryovials set status='Almacenamiento definitivo',box_id=p_box_id,position_no=p_position_no,updated_at=now() where id=p_cryovial_id;
 insert into public.clinical_cryovial_events(workspace_id,cryovial_id,action,from_box_id,from_position,to_box_id,to_position,actor_id,notes)
 values(p_workspace_id,p_cryovial_id,'Traslado a almacenamiento definitivo',v_vial.box_id,v_vial.position_no,p_box_id,p_position_no,v_actor,p_notes);
 v_expected:=coalesce(v_sample.primary_aliquots,0)+coalesce(v_sample.backup_aliquots,0);
 select count(*),count(*) filter(where status='Almacenamiento definitivo' and box_id=p_box_id)
 into v_total,v_final_count from public.clinical_cryovials where workspace_id=p_workspace_id and sample_id=v_sample.id;
 if v_total=v_expected and v_final_count=v_expected then
   perform public.transition_clinical_sample(v_sample.id,'CONGELADOR_DEFINITIVO','Todos los crioviales trasladados a almacenamiento definitivo',null,null,null,p_box_id);
 end if;
 return jsonb_build_object('ok',true,'cryovial_id',p_cryovial_id,'sample_completed',(v_total=v_expected and v_final_count=v_expected));
end;
$$;
revoke all on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) from public;
grant execute on function public.register_clinical_cryovial(uuid,uuid,text,text,uuid,integer) to authenticated;
revoke all on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) from public;
grant execute on function public.move_clinical_cryovial_to_definitive(uuid,uuid,uuid,integer,text) to authenticated;
commit;
