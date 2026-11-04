-- Quitar pruebas repetidas del catálogo JSON por nombre/código normalizado.
-- Conserva el elemento con más datos y respeta el ID original del elemento conservado.
with expanded as (
 select w.workspace_id,w.user_id,e.item,e.ord,
        regexp_replace(lower(btrim(coalesce(e.item->>'code',e.item->>'name',''))),'[^a-z0-9]','','g') as identity,
        (select count(*) from jsonb_each(e.item) kv
         where kv.value is not null and kv.value <> 'null'::jsonb
           and btrim(trim(both '"' from kv.value::text)) <> '') as richness
 from public.workspace_app_state w
 cross join lateral jsonb_array_elements(coalesce(w.state->'catalog','[]'::jsonb)) with ordinality as e(item,ord)
), ranked as (
 select *,row_number() over(partition by workspace_id,user_id,identity order by richness desc,ord asc) rn
 from expanded
), deduped as (
 select workspace_id,user_id,jsonb_agg(item order by ord) filter(where rn=1) as catalog,
        count(*) total,count(*) filter(where rn=1) kept
 from ranked group by workspace_id,user_id
)
update public.workspace_app_state w
set state=jsonb_set(w.state,'{catalog}',d.catalog,true),
    revision=w.revision+1,
    updated_at=now()
from deduped d
where w.workspace_id=d.workspace_id
  and w.user_id=d.user_id
  and d.total>d.kept;
