import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112200000_private_module_tables.sql',import.meta.url),'utf8');
test('nine independent protected physical module tables with catch-all',()=>{
 for(const m of ['patients','journeys','companies','reports','catalog','attentions','clinical','settings','extras'])
  assert.ok(sql.includes('create table if not exists private.fr_module_'+m+'('));
 assert.match(sql,/else 'extras' end/);
 assert.match(sql,/after insert or update of state or delete/);
 assert.match(sql,/on conflict\(workspace_id\) do update/);
 assert.match(sql,/where destination\.payload is distinct from excluded\.payload/);
 assert.match(sql,/from public\.workspace_shared_app_state/);
 assert.doesNotMatch(sql,/delete from public\.patients|truncate public\.|drop table public\.workspace_shared_app_state/i);
});
