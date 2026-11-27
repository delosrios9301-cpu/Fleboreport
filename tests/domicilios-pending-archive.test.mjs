import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [app,migration,index]=await Promise.all([
 read('domicilios.js'),
 read('supabase/migrations/20261114180500_allow_pending_home_visit_archive.sql'),
 read('index.html')
]);
const allowedDb="'pending_assignment','pending_acceptance','cancelled','rejected','not_performed','patient_absent','patient_refused','samples_taken','completed'";
const allowedUi="'Pendiente de asignación','Pendiente de aceptación','Cancelado','Rechazado','No realizado','Paciente ausente','Paciente rechazó la toma','Muestras tomadas','Finalizado'";

test('Las fichas pendientes muestran archivar sólo al administrador o usuario autorizado',()=>{
 assert.ok(app.includes('HV_ARCHIVE_STATES=new Set(['+allowedUi+'])'));
 assert.match(app,/cloud\.role==='admin'\|\|\(typeof window\.fleboCan==='function'&&window\.fleboCan\('domicilios','delete'\)\)/);
 assert.match(app,/if\(!canArchiveVisit\(v\)\)return card/);
 assert.match(app,/if\(!canArchiveVisit\(visit\)\)/);
 assert.match(app,/pendingVisit\?'La solicitud dejará de aparecer en la agenda y las invitaciones/);
 assert.match(app,/cloud\.client\.rpc\('archive_home_visit',\{p_home_visit_id:String\(id\)\}\)/);
 assert.doesNotMatch(app,/\.from\('home_visits'\)\.delete\(/);
 assert.ok(Number(index.match(/domicilios\.js\?v=(\d{8})-[^"']+/)?.[1])>=20261115,'Debe cargarse el script de Domicilios versionado');
 assert.doesNotThrow(()=>new Function(app));
});

test('Servidor permite pendientes sin perder permiso, seguridad y protección clínica',()=>{
 const section=migration.split('CREATE OR REPLACE FUNCTION public.archive_home_visit')[1];
 assert.ok(section);
 assert.equal(migration.split(allowedDb).length-1,2,'RPC y trigger comparten estados permitidos');
 assert.match(migration,/private\.has_workspace_permission\(old\.workspace_id,'domicilios','delete'\)/);
 assert.match(migration,/private\.has_workspace_permission\(v_visit\.workspace_id,'domicilios','delete'\)/);
 assert.equal(migration.match(/t\.status='collected'/g)?.length,2);
 assert.match(migration,/if new\.archived_at is null or new\.archived_by is distinct from auth\.uid\(\)/);
 assert.match(migration,/if \(to_jsonb\(new\) - 'archived_at' - 'archived_by' - 'updated_at'\)/);
 assert.match(migration,/set archived_at=now\(\),archived_by=v_uid/);
 assert.match(migration,/revoke all on function public\.archive_home_visit\(uuid\) from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.archive_home_visit\(uuid\) to authenticated/);
});

test('El flebotomista no recibe invitaciones a domicilios archivados',()=>{
 const preview=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.list_home_visit_invitation_previews'));
 assert.match(preview,/and a\.assigned_user_id=v_uid/);
 assert.match(preview,/and a\.status='invited'/);
 assert.match(preview,/and v\.status='pending_acceptance'\s+and v\.archived_at is null/);
 assert.match(preview,/a\.id=\(/);
 assert.match(preview,/revoke all on function public\.list_home_visit_invitation_previews\(uuid\) from public,anon,authenticated/);
 assert.doesNotMatch(preview,/select v\.\*|select a\.\*|v\.address|v\.patient_phone|v\.notes|v\.patient_id/i);
});
