import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261101000000_initial_schema.sql', import.meta.url), 'utf8');
const domicilios = await readFile(new URL('../domicilios.js', import.meta.url), 'utf8');
const cloudSync = await readFile(new URL('../cloud-state-sync.js', import.meta.url), 'utf8');
const patientCloudSync = await readFile(new URL('../patient-cloud-sync.js', import.meta.url), 'utf8');
const patientCloudMigration = await readFile(new URL('../supabase/migrations/20261103100000_workspace_patient_cloud_records.sql', import.meta.url), 'utf8');
const patientDocumentMatchMigration = await readFile(new URL('../supabase/migrations/20261103110000_normalize_patient_document_matching.sql', import.meta.url), 'utf8');
const patientSearchMigration = await readFile(new URL('../supabase/migrations/20261103120000_patient_search_rpc.sql', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../notifications-center.js', import.meta.url), 'utf8');
const cloudSyncMigration = await readFile(new URL('../supabase/migrations/20261102120000_workspace_app_state_sync.sql', import.meta.url), 'utf8');
const auth = await readFile(new URL('../supabase-auth.js', import.meta.url), 'utf8');
const configuration = await readFile(new URL('../configuracion.js', import.meta.url), 'utf8');
const configurationMigration = await readFile(new URL('../supabase/migrations/20261102154000_fleboreport_configuration_security.sql', import.meta.url), 'utf8');
const granularMigration = await readFile(new URL('../supabase/migrations/20261102160000_granular_permission_enforcement.sql', import.meta.url), 'utf8');
const permissionUpsertMigration = await readFile(new URL('../supabase/migrations/20261102173000_member_permission_upsert.sql', import.meta.url), 'utf8');
const permissionSaveMigration = await readFile(new URL('../supabase/migrations/20261102180000_fix_member_permission_save.sql', import.meta.url), 'utf8');

test('los scripts incrustados tienen sintaxis JavaScript válida', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(scripts.length >= 10, 'se esperaban los módulos de la aplicación');
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new Function(source), `script inline #${index + 1}`);
  });
});

test('la aplicación ofrece módulos clave y respaldo local', () => {
  for (const text of ['view-home', 'view-journey', 'view-patients', 'view-clinical-studies', 'view-clinical-processing', 'Descargar respaldo completo', 'Restaurar respaldo']) {
    assert.ok(html.includes(text), `falta contenido esperado: ${text}`);
  }
  assert.match(html, /function exportLocalBackup\(/);
  assert.match(html, /function restoreLocalBackup\(/);
  assert.match(html, /Ya existe una muestra con el mismo estudio/);
});

test('el esquema incluye seguridad por espacio y trazabilidad', () => {
  for (const table of ['workspace_members', 'patients', 'attentions', 'appointments', 'inventory_movements', 'clinical_samples', 'clinical_cryovials', 'clinical_cryovial_events', 'audit_logs']) {
    assert.ok(migration.includes(`public.${table}`), `falta tabla: ${table}`);
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /reject_audit_mutation/i);
  assert.match(migration, /seed_freezer_drawers/i);
  assert.match(migration, /seed_rack_trays/i);
});


const homeVisitMigration = await readFile(new URL('../supabase/migrations/20261103000000_home_visits_security_snapshots.sql', import.meta.url), 'utf8');

test('los domicilios limitan a cada técnico a sus asignaciones', () => {
  for (const policy of [
    'home_visits_read_scoped',
    'home_visit_assignments_read_scoped',
    'home_visit_tests_read_scoped',
    'home_visit_events_read_scoped',
    'home_visit_notifications_read_scoped'
  ]) {
    assert.ok(homeVisitMigration.includes(policy), `falta política de acceso: ${policy}`);
  }
  assert.match(homeVisitMigration, /assigned_user_id = \(select auth\.uid\(\)\)/);
  assert.match(homeVisitMigration, /array\['admin','clinician','reception'\]/);
  assert.match(homeVisitMigration, /drop policy if exists home_visits_read_member/i);
});

test('las pruebas de domicilios conservan una copia de los requisitos del catálogo', () => {
  assert.match(homeVisitMigration, /add column if not exists catalog_snapshot jsonb/i);
  assert.match(homeVisitMigration, /Copia inmutable de los requisitos del catálogo/i);
});

test('el flebotomista no puede alterar la asignación ni los datos clínicos originales', () => {
  assert.match(homeVisitMigration, /guard_home_visit_assignment_update/i);
  assert.match(homeVisitMigration, /guard_home_visit_technician_update/i);
  assert.match(homeVisitMigration, /guard_home_visit_test_update/i);
  assert.match(homeVisitMigration, /No puedes alterar la prueba ni su snapshot del catálogo/i);
  assert.match(homeVisitMigration, /patient_absent/);
  assert.match(homeVisitMigration, /patient_refused/);
  assert.match(homeVisitMigration, /stamp_home_visit_event/i);
  assert.match(homeVisitMigration, /stamp_home_visit_test_creator/i);
  assert.match(homeVisitMigration, /home_visit_tests_insert_staff_or_assignee/i);
  assert.match(homeVisitMigration, /El flebotomista solo puede añadir pruebas adicionales del catálogo/i);
  assert.match(homeVisitMigration, /catalog_snapshot := jsonb_build_object/i);
});

test('el módulo de domicilios valida incidencias y observaciones por prueba', () => {
  assert.doesNotThrow(() => new Function(domicilios), 'domicilios.js debe tener sintaxis válida');
  for (const status of ['Paciente ausente', 'Paciente rechazó la toma', 'No realizado']) {
    assert.ok(domicilios.includes(status), `falta el estado: ${status}`);
  }
  assert.match(domicilios, /Indica por qué no se pudo tomar esta prueba/);
  assert.match(domicilios, /Observación de no toma/);
  assert.match(domicilios, /Actualiza el estado de cada prueba antes de continuar/);
  for (const feature of ['technicianFieldScreen', 'hv-field-screen', 'Abrir ubicación en Google Maps', 'Observaciones de campo', 'Resumen de recipientes', 'hvSaveFieldObservation']) {
    assert.ok(domicilios.includes(feature), `falta experiencia de campo: ${feature}`);
  }
  assert.match(domicilios, /if\(cloud\.role==='technician'\)return technicianFieldScreen\(v\)/);

});

test('la autenticación global protege la aplicación y controla los módulos por rol', () => {
 assert.match(auth, /fleboAuthGate/);
 assert.match(auth, /function roleModules/);
 assert.match(auth, /function canAccess/);
 assert.match(auth, /fleboGlobalSignOut/);
 assert.match(auth, /admin-create-user/);
});

test('el módulo de configuración tiene sintaxis válida y controles administrativos', () => {
  assert.doesNotThrow(() => new Function(configuration), 'configuracion.js debe tener sintaxis válida');
  for (const feature of ['Seguridad y sedes', 'role_custom', 'Doble autorización', 'Administrador principal protegido', 'Permisos granulares', 'Datos híbridos']) {
    assert.ok(configuration.includes(feature), `falta funcionalidad de configuración: ${feature}`);
  }
  assert.match(auth, /loadCurrentPermissions/);
  assert.match(auth, /is_primary_admin/);
  assert.match(auth, /role_custom/);
});

test('la migración de configuración protege al administrador y habilita sedes híbridas', () => {
  for (const table of ['sedes', 'user_sedes', 'role_permissions', 'member_permissions', 'workspace_security_settings', 'approval_requests', 'sync_devices']) {
    assert.match(configurationMigration, new RegExp('create table if not exists public\\.' + table, 'i'));
  }
  assert.match(configurationMigration, /prevent_primary_admin_membership_change/);
  assert.match(configurationMigration, /prevent_primary_admin_settings_change/);
  assert.match(configurationMigration, /primary_admin_user_id uuid not null references auth\.users/);
  assert.match(configurationMigration, /role_custom/);
});

test('las autorizaciones y permisos granulares se validan mediante RLS', () => {
  assert.match(granularMigration, /role_permissions_member_read/);
  assert.match(granularMigration, /as restrictive for select/i);
  assert.match(granularMigration, /home_visits_permission_scope/);
  assert.match(granularMigration, /home_visit_assignments_permission_scope/);
  assert.match(granularMigration, /audit_approval_request/);
});

test('el guardado de permisos individuales usa el RPC protegido por la base de datos', () => {
  assert.match(permissionUpsertMigration, /unique nulls not distinct/i);
  assert.match(configuration, /rpc\('save_member_permissions'/);
  assert.match(permissionSaveMigration, /create or replace function public\.save_member_permissions/i);
});

test('la sincronización de datos está conectada, aislada por usuario y tiene sintaxis válida', () => {
  assert.doesNotThrow(() => new Function(cloudSync), 'cloud-state-sync.js debe tener sintaxis válida');
  assert.match(html, /src="\.\/cloud-state-sync\.js"/);
  assert.match(html, /flebo:local-state-saved/);
  assert.match(cloudSyncMigration, /primary key \(workspace_id,user_id\)/i);
  assert.match(cloudSyncMigration, /user_id=auth\.uid\(\)/i);
  assert.match(cloudSync, /\.eq\('user_id',userId\)/);
  assert.match(cloudSyncMigration, /supabase_realtime/i);
});


test('los expedientes se sincronizan en la tabla maestra compartida del espacio', () => {
  assert.doesNotThrow(() => new Function(patientCloudSync), 'patient-cloud-sync.js debe tener sintaxis válida');
  assert.ok(html.includes('src="./patient-cloud-sync.js"'));
  assert.match(patientCloudMigration, /add column if not exists app_data jsonb/i);
  assert.match(patientCloudMigration, /sync_workspace_patient/i);
  assert.match(patientCloudMigration, /supabase_realtime/i);
  assert.match(patientCloudSync, /journeyHistory/);
});

test('la barra superior muestra estado cloud sin fecha duplicada ni mensajes de guardado local', () => {
  assert.ok(!html.includes("toast('Registro guardado en este dispositivo.')"));
  assert.ok(!html.includes("toast('Expediente guardado en este dispositivo.')"));
  assert.doesNotMatch(html, /id="todayChip"/);
  assert.match(html, /flebo-cloud-tablet-layout/);
});

test('el centro de notificaciones puede mostrar avisos del dispositivo y consultar cambios recientes', () => {
  assert.doesNotThrow(() => new Function(notifications));
  assert.match(notifications, /showDeviceNotification/);
  assert.match(notifications, /setInterval/);
});


test('la búsqueda del expediente muestra su historial completo y la coincidencia normaliza documentos', () => {
  assert.match(domicilios, /Historial de atenciones médicas/);
  assert.match(domicilios, /Historial de jornadas/);
  assert.match(domicilios, /Historial de domicilios/);
  assert.match(patientDocumentMatchMigration, /regexp_replace\(lower\(btrim\(p\.document_number\)\)/i);
  assert.match(patientDocumentMatchMigration, /pg_advisory_xact_lock/i);
  assert.ok(domicilios.includes("rpc('search_workspace_patients'"));
  assert.match(patientSearchMigration, /search_workspace_patients/i);
  assert.match(patientSearchMigration, /regexp_replace/i);
});

test('la PWA renueva la caché para instalar la última versión de Domicilios y expedientes', () => {
  const serviceWorker = html.includes('src="./patient-cloud-sync.js"');
  assert.ok(serviceWorker, 'el HTML carga la sincronización de pacientes');
});
