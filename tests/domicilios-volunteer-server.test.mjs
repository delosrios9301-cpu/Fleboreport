import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [edge,sql]=await Promise.all([
 read('supabase/functions/domicilios-notifications/index.ts'),
 read('supabase/migrations/20261114135500_voluntary_home_visit_claim_admin_and_alerts.sql')
]);
test('Las notificaciones Push distinguen ofertas y aceptación voluntaria',()=>{
 assert.match(edge,/volunteer_available: "Domicilio disponible/);
 assert.match(edge,/volunteer_claimed: "Domicilio asignado voluntariamente"/);
 assert.match(edge,/alert\.metadata\?\.actor_user_id === alert\.recipient_user_id/);
 assert.match(edge,/view=domicilios&available=/);
 assert.match(edge,/managerCanDispatch/);
});
test('RPC reclama visita única con lock y protege los datos',()=>{
 assert.match(sql,/create or replace function public\.volunteer_home_visit/i);
 assert.match(sql,/for update/i);
 assert.match(sql,/status='accepted'/i);
 assert.match(sql,/list_available_home_visits/i);
 assert.match(sql,/private\.has_workspace_permission/i);
 assert.match(sql,/no tienes permiso/i);
 assert.match(sql,/on conflict\(workspace_id,entity,record_id,recipient_user_id,alert_code\)/i);
 assert.match(sql,/revoke all on function public\.volunteer_home_visit\(uuid\)/i);
 assert.match(sql,/grant execute on function public\.volunteer_home_visit\(uuid\) to authenticated/i);
 assert.match(sql,/grant execute on function public\.assign_home_visit_member\(uuid,uuid\) to authenticated/i);
 assert.match(sql,/guard_home_visit_technician_update/i);
 assert.match(sql,/list_domicile_assignable_members/i);
});
