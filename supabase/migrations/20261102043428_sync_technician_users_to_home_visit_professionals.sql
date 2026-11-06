create or replace function public.sync_workspace_technician_professional()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  if tg_op = 'DELETE' then
    if old.role = 'technician' then
      update public.professionals set active = false where workspace_id = old.workspace_id and user_id = old.user_id;
    end if;
    return old;
  end if;
  if new.role = 'technician' and new.active then
    select nullif(trim(p.display_name), '') into v_name from public.profiles p where p.user_id = new.user_id;
    if v_name is null then
      select nullif(trim(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))), '') into v_name from auth.users u where u.id = new.user_id;
    end if;
    insert into public.professionals(workspace_id, user_id, name, active)
    values(new.workspace_id, new.user_id, coalesce(v_name, 'Flebotomista'), true)
    on conflict (workspace_id, user_id) where user_id is not null
    do update set name = excluded.name, active = true;
  elsif tg_op = 'UPDATE' and old.role = 'technician' and (new.role <> 'technician' or not new.active) then
    update public.professionals set active = false where workspace_id = new.workspace_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

-- Crear/vincular el registro operativo de los flebotomistas que ya existen.
insert into public.professionals(workspace_id, user_id, name, active)
select m.workspace_id, m.user_id,
       coalesce(nullif(trim(p.display_name), ''), nullif(trim(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))), ''), 'Flebotomista'),
       true
from public.workspace_members m
left join public.profiles p on p.user_id = m.user_id
left join auth.users u on u.id = m.user_id
where m.role = 'technician' and m.active = true
on conflict (workspace_id, user_id) where user_id is not null
 do update set name = excluded.name, active = true;

drop trigger if exists sync_workspace_technician_professional on public.workspace_members;
create trigger sync_workspace_technician_professional
 after insert or update of role, active on public.workspace_members
 for each row execute function public.sync_workspace_technician_professional();