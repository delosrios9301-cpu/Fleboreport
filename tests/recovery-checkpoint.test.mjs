import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/migrations/20261112170000_private_integrity_checkpoint.sql',import.meta.url),'utf8');

test('checkpoint de recuperación solo copia datos en esquema privado, sin mutar registros',()=>{
 assert.match(source,/create table if not exists private\.fleboreport_integrity_checkpoints/i);
 assert.match(source,/revoke all on table private\.fleboreport_integrity_checkpoints/i);
 assert.match(source,/from public,anon,authenticated,service_role/i);
 assert.match(source,/insert into private\.fleboreport_integrity_checkpoints/i);
 for(const t of ['patients','clinical_samples','home_visits','workspace_shared_app_state','member_permissions','reports']){
  assert.match(source,new RegExp('from public\\\\.'+t+'\\\\s+t\\\\s+where t\\\\.workspace_id=s\\\\.workspace_id'));
 }
 assert.doesNotMatch(source,/delete from public\.|truncate table|drop table|update public\./i);
 assert.match(source,/md5\(c\.snapshot::text\)/);
});
