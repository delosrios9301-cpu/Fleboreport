import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261112171000_viewer_state_projection.sql',import.meta.url),'utf8');
const cloud=await readFile(new URL('../cloud-state-sync.js',import.meta.url),'utf8');
test('viewer only receives authorized report history from shared state',()=>{
 assert.match(sql,/private\.member_has_workspace_role\(p_workspace_id,v_uid,array\['viewer'\]/);
 assert.match(sql,/private\.has_workspace_permission\(p_workspace_id,'reports','view'\)/);
 assert.match(sql,/'reportHistory',coalesce/);
 assert.match(sql,/'reportHistoryLogos',coalesce/);
 assert.doesNotMatch(sql,/'patients',coalesce/);
 assert.match(sql,/grant execute on function public\.get_workspace_shared_app_state\(uuid\) to authenticated,service_role/);
});
test('viewer startup invalidates old local clinical cache before loading server projection',()=>{
 assert.match(cloud,/if\(role==='viewer'\)applyCloudState\(window\.FleboAppState\.empty\(\),true\)/);
 assert.doesNotThrow(()=>new Function(cloud));
});
