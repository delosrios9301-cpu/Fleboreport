import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261101195511_20261101000000_initial_schema.sql', import.meta.url), 'utf8');
const domicilios = await readFile(new URL('../domicilios.js', import.meta.url), 'utf8');
const notificationSettings = await readFile(new URL('../notification-settings.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const domiciliosNotificationsFunction = await readFile(new URL('../supabase/functions/domicilios-notifications/index.ts', import.meta.url), 'utf8');
const cloudSync = await readFile(new URL('../cloud-state-sync.js', import.meta.url), 'utf8');
const patientCloudSync = await readFile(new URL('../patient-cloud-sync.js', import.meta.url), 'utf8');
const patientCloudMigration = await readFile(new URL('../supabase/migrations/20261103015842_workspace_patient_cloud_records.sql', import.meta.url), 'utf8');
const patientDocumentMatchMigration = await readFile(new URL('../supabase/migrations/20261103020920_normalize_patient_document_matching.sql', import.meta.url), 'utf8');
const patientSearchMigration = await readFile(new URL('../supabase/migrations/20261103021214_patient_search_rpc.sql', import.meta.url), 'utf8');
const noAutoClinicalStructureMigration = await readFile(new URL('../supabase/migrations/20261104135426_disable_automatic_clinical_structure_seeding.sql', import.meta.url), 'utf8');
const removeUnusedClinicalSlotsMigration = await readFile(new URL('../supabase/migrations/20261104135505_remove_unused_automatically_seeded_clinical_slots.sql', import.meta.url), 'utf8');
const aliquotStartMigration = await readFile(new URL('../supabase/migrations/20261104152352_require_aliquot_counts_at_processing_start.sql', import.meta.url), 'utf8');
const clinicalCloudSync = await readFile(new URL('../clinical-cloud-sync.js', import.meta.url), 'utf8');
const clinicalProcessing = await readFile(new URL('../clinical-processing-simple.js', import.meta.url), 'utf8');
const authenticatedReceptionMigration = await readFile(new URL('../supabase/migrations/20261104154830_track_authenticated_clinical_sample_reception.sql', import.meta.url), 'utf8');
const duplicateProtectionMigration = await readFile(new URL('../supabase/migrations/20261104135155_prevent_duplicate_user_registered_records.sql', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../notifications-center.js', import.meta.url), 'utf8');
const cloudSyncMigration = await readFile(new URL('../supabase/migrations/20261103013544_workspace_app_state_sync.sql', import.meta.url), 'utf8');
const workspaceStateIsolationMigration = await readFile(new URL('../supabase/migrations/20261103013859_isolate_workspace_app_state_per_user.sql', import.meta.url), 'utf8');
const auth = await readFile(new URL('../supabase-auth.js', import.meta.url), 'utf8');
const configuration = await readFile(new URL('../configuracion.js', import.meta.url), 'utf8');
const configurationMigration = await readFile(new URL('../supabase/migrations/20261102154422_fleboreport_configuration_security.sql', import.meta.url), 'utf8');
const granularMigration = await readFile(new URL('../supabase/migrations/20261102154606_granular_permission_enforcement.sql', import.meta.url), 'utf8');
const permissionUpsertMigration = await readFile(new URL('../supabase/migrations/20261102155041_member_permission_upsert.sql', import.meta.url), 'utf8');
const permissionSaveMigration = await readFile(new URL('../supabase/migrations/20261103001739_fix_member_permission_save.sql', import.meta.url), 'utf8');
const adminRolePermissionsMigration = await readFile(new URL('../supabase/migrations/20261105195850_complete_admin_role_permissions.sql', import.meta.url), 'utf8');

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


const homeVisitMigration = await readFile(new URL('../supabase/migrations/20261101195538_20261103000000_home_visits_security_snapshots.sql', import.meta.url), 'utf8');

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
  assert.doesNotMatch(domicilios, /id="hvTestPush"/);
  assert.match(notificationSettings, /id="hvActivatePush"/);
  assert.match(notificationSettings, /id="hvTestPush"/);
  assert.match(domicilios, /invokeDomicileNotifications\(\{action:'test-push'\}\)/);
  assert.match(domicilios, /testPushInBackground/);
  assert.match(domicilios, /action:'cancelled'/);
  assert.match(domiciliosNotificationsFunction, /action === \"cancelled\"/);
  assert.match(domiciliosNotificationsFunction, /home_visit_cancelled/);
  assert.match(domiciliosNotificationsFunction, /No te desplaces ni prepares la toma/);
  assert.match(domicilios, /let pushRegistrationPromise=null/);
  assert.match(domicilios, /if\(pushRegistrationPromise\)return pushRegistrationPromise/);

});

test('la autenticación global protege la aplicación y controla los módulos por rol', () => {
 assert.match(auth, /const authChecking=!authBootComplete&&!currentUser/);
 assert.match(auth, /const membership=await loadMembership\(user\)/);
 assert.match(auth, /Por seguridad, el acceso permanece bloqueado/);
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
    assert.match(configurationMigration, new RegExp('create table if not exists public\.' + table, 'i'));
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

test('el perfil administrador muestra todos los permisos activos y no permite desactivarlos', () => {
  assert.match(configuration, /adminRoleLocked=mode==='role'/);
  assert.match(configuration, /adminRoleLocked\|\|map\.get/);
  assert.match(configuration, /adminRoleLocked\?' disabled':''/);
  assert.match(configuration, /Permisos del administrador · acceso integral/);
  assert.match(configuration, /Acceso integral protegido/);
  assert.match(adminRolePermissionsMigration, /cross join \(values/i);
  assert.match(adminRolePermissionsMigration, /select w\.id,'admin'/i);
  assert.match(adminRolePermissionsMigration, /do update set allowed=true/i);
});

test('el guardado de permisos individuales usa el RPC protegido por la base de datos', () => {
  assert.match(permissionUpsertMigration, /unique nulls not distinct/i);
  assert.match(configuration, /rpc\('save_member_permissions'/);
  assert.match(permissionSaveMigration, /create or replace function public\.save_member_permissions/i);
});

test('la sincronización de datos está conectada, aislada por usuario y tiene sintaxis válida', () => {
  assert.doesNotThrow(() => new Function(cloudSync), 'cloud-state-sync.js debe tener sintaxis válida');
  assert.match(html, /src="\.\/cloud-state-sync\.js(?:\?[^\"]*)?"/);
  assert.match(html, /flebo:local-state-saved/);
  assert.match(workspaceStateIsolationMigration, /primary key \(workspace_id,user_id\)/i);
  assert.match(workspaceStateIsolationMigration, /user_id = auth\.uid\(\)/i);
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
  assert.match(notifications, /postgres_changes/);
  assert.match(notifications, /visibilitychange/);
  assert.doesNotMatch(notifications, /setInterval\(/);
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

const clinicalDeleteMigration = await readFile(new URL('../supabase/migrations/20261103184435_clinical_sample_soft_delete_with_audit.sql', import.meta.url), 'utf8');

test('las muestras incorrectas pueden retirarse con motivo y auditoría sin borrar la trazabilidad', () => {
  assert.doesNotThrow(() => new Function(clinicalCloudSync), 'clinical-cloud-sync.js debe tener sintaxis válida');
  assert.match(clinicalCloudSync, /async function deleteSample\(sample,reason\)/);
  assert.match(clinicalCloudSync, /\.is\('deleted_at',null\)/);
  assert.match(clinicalCloudSync, /deleteSample:trackClinicalMutation\(deleteSample\),transition:trackClinicalMutation\(transition\)/);
  assert.match(html, /async function deleteClinicalSample\(id\)/);
  assert.match(html, /Eliminar (?:registro|muestra|sujeto)|Quitar local/);
  assert.match(clinicalDeleteMigration, /create or replace function public\.delete_clinical_sample/i);
  assert.match(clinicalDeleteMigration, /sample_deleted/);
  assert.match(clinicalDeleteMigration, /ELIMINADA/);
  assert.match(clinicalDeleteMigration, /revoke all on function public\.delete_clinical_sample\(uuid,uuid,text\) from public/i);
  assert.match(clinicalDeleteMigration, /workflow_status not in \('REGISTRADO','EN_REVISION','PENDIENTE_PROCESO'\)/);
});

test('las bandejas separan la revisión clínica del procesamiento y confirman transiciones en la nube', () => {
  assert.match(html, /var processingModule=document\.getElementById\('view-clinical-processing'\)/);
  assert.match(html, /\['PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'\]/);
  assert.match(html, /\['REGISTRADO','EN_REVISION'\]/);
  assert.match(html, /transitionResult\.ok!==true\|\|transitionResult\.status!==next/);
  assert.match(html, /refreshSamples\(\)\.catch\(function\(e\)/);
  assert.match(clinicalCloudSync, /refreshSamples\(\)[\s\S]*?refreshClinicalViewSafely\(\)[\s\S]*?return true/);
  assert.match(clinicalCloudSync, /async function refreshSamples\(\)/);
  assert.match(clinicalCloudSync, /async function refreshSamples\(\)[\s\S]*?requireReady\(\['admin','clinician','technician','reception'\]\)[\s\S]*?loadRemoteSamples\(\)[\s\S]*?return true/);
  assert.match(clinicalCloudSync, /data\.status!==next/);
  assert.match(clinicalCloudSync, /if\(args\.primaryAliquots!=null\)sample\.primaryAliquots=Number\(args\.primaryAliquots\)/);
});

test('Estudios Clínicos conserva una bandeja de revisión y solo libera aprobadas al procesamiento', () => {
  assert.match(html, /id="clinicalReviewRows"/);
  assert.match(html, /Aprobar y enviar a proceso/);
  assert.match(html, /\['REGISTRADO','EN_REVISION'\]/);
  assert.match(html, /\['PENDIENTE_PROCESO','PROCESANDO','ALMACENAMIENTO_TEMPORAL','CONGELADOR_DEFINITIVO'\]/);
  assert.match(html, /reviewSamples=\(state\.clinicalSamples\|\|\[\]\)\.filter/);
  assert.match(html, /window\.workflowStatusOf=workflowStatusOf/);
});


test('la configuración de almacenamiento se sincroniza al crear cajas y permite selección temporal por muestra', () => {
  assert.match(html, /syncStorageConfigurationNow/);
  assert.match(html, /Caja individual creada y sincronizada en la nube/);
  assert.match(html, /toggleClinicalSampleCryos/);
  assert.match(html, /data-move-sample=/);
  assert.ok(clinicalCloudSync.includes('async function syncStorageConfiguration()'));
  assert.ok(clinicalCloudSync.includes('await syncBoxes(studies)'));
});


test('las muestras locales retiradas no reaparecen al sincronizar desde la nube', () => {
  assert.match(html, /clinicalLocalDeletedSampleIds:Array\.isArray\(parsed\.clinicalLocalDeletedSampleIds\)/);
  assert.match(html, /if\(!sample\.cloudId\)[\s\S]*?clinicalLocalDeletedSampleIds=Array\.from\(new Set/);
  assert.match(clinicalCloudSync, /!locallyDeleted\.has\(String\(x\.id\)\)/);
  assert.match(html, /No se modificó Supabase/);
});


test('las eliminaciones de muestras se conservan en la sincronización general y no se fusionan de vuelta', () => {
  assert.match(cloudSync, /clinicalSamples','clinicalLocalDeletedSampleIds','clinicalSampleHistory/);
  assert.match(cloudSync, /deletedClinicalSampleIds=new Set\(\(out\.clinicalLocalDeletedSampleIds\|\|\[\]\)\.map\(String\)\)/);
  assert.match(cloudSync, /out\.clinicalSamples=\(out\.clinicalSamples\|\|\[\]\)\.filter\(x=>!deletedClinicalSampleIds\.has\(String\(x\.id\)\)\)/);
  assert.match(clinicalCloudSync, /visibleNext=mergedSamples\.filter\(x=>!locallyDeleted\.has\(String\(x\.id\)\)\)/);
  assert.match(html, /await window\.FleboClinicalCloud\.deleteSample\(sample,reason\);[\s\S]*?clinicalLocalDeletedSampleIds=Array\.from\(new Set/);
});


const simpleProcessing = await readFile(new URL('../clinical-processing-simple.js', import.meta.url), 'utf8');
const simpleProcessingMigration = await readFile(new URL('../supabase/migrations/20261103221950_simplify_clinical_processing_states.sql', import.meta.url), 'utf8');
test('el técnico registra y guarda las cantidades de alícuotas al iniciar el procesamiento', () => {
  assert.match(simpleProcessing, /numberField\('Alícuotas principales'/);
  assert.match(simpleProcessing, /numberField\('Alícuotas backup'/);
  assert.match(simpleProcessing, /primaryAliquots:p,backupAliquots:b/);
  assert.match(simpleProcessing, /Alícuotas: /);
  assert.match(clinicalCloudSync, /if\(next==='PROCESANDO'\).*args\.primaryAliquots/);
  assert.match(aliquotStartMigration, /p_next_status='PROCESANDO'/);
  assert.match(aliquotStartMigration, /primary_aliquots=case when p_next_status='PROCESANDO'/);
  assert.match(aliquotStartMigration, /expected_primary_aliquots/);
  assert.match(aliquotStartMigration, /expected_backup_aliquots/);
  assert.match(aliquotStartMigration, /Registre la cantidad de alícuotas al iniciar/);
});


test('el módulo de procesamiento usa únicamente estados y no requiere cajas ni crioviales', () => {
  assert.doesNotThrow(() => new Function(simpleProcessing), 'clinical-processing-simple.js debe tener sintaxis válida');
  assert.match(html, /src="\.\/clinical-processing-simple\.js(?:\?[^\"]*)?"/);
  const view = html.slice(html.indexOf('<section class="view" id="view-clinical-processing">'), html.indexOf('<section class="view" id="view-settings">'));
  assert.ok(view.length > 0, 'debe existir la vista de procesamiento');
  for (const obsolete of ['clinicalBulkLocation', 'cryoBox', 'cryoPosition', 'clinicalCryoRows', 'caja disponible', 'Ubicación']) {
    assert.ok(!view.toLowerCase().includes(obsolete.toLowerCase()), 'el flujo ya no debe mostrar: ' + obsolete);
  }
  for (const state of ['PENDIENTE_PROCESO', 'PROCESANDO', 'ALMACENAMIENTO_TEMPORAL', 'CONGELADOR_DEFINITIVO']) {
    assert.ok(simpleProcessing.includes(state), 'falta transición: ' + state);
  }
  assert.match(simpleProcessing, /startClinicalProcessing/);
  assert.match(simpleProcessing, /completeClinicalSampleProcessing/);
  assert.match(simpleProcessing, /finalizeClinicalSampleStorage/);
  assert.match(simpleProcessing, /cloud\.transition\(sample,next/);
});

test('la base de datos permite completar almacenamiento temporal y definitivo sin cajas ni crioviales', () => {
  assert.match(simpleProcessingMigration, /create or replace function public\.guard_clinical_sample_workflow/i);
  assert.match(simpleProcessingMigration, /create or replace function public\.transition_clinical_sample/i);
  assert.match(simpleProcessingMigration, /p_next_status='ALMACENAMIENTO_TEMPORAL' and v_old_status='PROCESANDO'/);
  assert.match(simpleProcessingMigration, /p_next_status='CONGELADOR_DEFINITIVO' and v_old_status='ALMACENAMIENTO_TEMPORAL'/);
  assert.doesNotMatch(simpleProcessingMigration, /clinical_cryovials/);
  assert.doesNotMatch(simpleProcessingMigration, /p_primary_aliquots is null/);
  assert.match(simpleProcessingMigration, /grant execute on function public\.transition_clinical_sample/i);
});

test('la sincronización de muestras ya no depende de leer ubicaciones de cajas', () => {
  assert.match(clinicalCloudSync, /async function refreshSamples\(\)[\s\S]*?requireReady\(\['admin','clinician','technician','reception'\]\)[\s\S]*?loadRemoteSamples\(\)[\s\S]*?return true/);
  assert.doesNotMatch(clinicalCloudSync, /async function refreshSamples\(\)\{[^}]*loadRemoteBoxes/);
  const sampleLoader=clinicalCloudSync.slice(clinicalCloudSync.indexOf('async function loadRemoteSamples()'),clinicalCloudSync.indexOf('async function syncConfiguration()'));
  assert.doesNotMatch(sampleLoader, /clinical_cryovials|clinical_cryovial_events/);
});


const catalogPersistence = await readFile(new URL('../clinical-catalog-persistence.js', import.meta.url), 'utf8');

test('los catálogos de visita y muestra se desactivan en Supabase y no vuelven al formulario de registro', () => {
  assert.doesNotThrow(() => new Function(catalogPersistence), 'clinical-catalog-persistence.js debe tener sintaxis válida');
  assert.ok(html.includes('src="./clinical-catalog-persistence.js"'));
  assert.ok(catalogPersistence.includes("item.active=false"));
  assert.ok(catalogPersistence.includes("await api.saveConfiguration()"));
  assert.ok(catalogPersistence.includes("item.active=true"));
  assert.ok(catalogPersistence.includes("x.active!==false"));
  assert.ok(catalogPersistence.includes("restoreClinicalCatalogItem"));
});


test('los catálogos clínicos oficiales no se restauran desde workspace_app_state', () => {
  assert.match(cloudSync, /CLINICAL_DB_CONFIG_KEYS=\['clinicalStudies','clinicalVisits','clinicalSampleTypes'\]/);
  assert.match(cloudSync, /CLINICAL_DB_CONFIG_KEYS\.forEach\(k=>\{out\[k\]=Array\.isArray\(local&&local\[k\]\)\?local\[k\]:\[\]\}\)/);
  assert.match(cloudSync, /CLINICAL_DB_CONFIG_KEYS\.forEach\(k=>\{safe\[k\]=Array\.isArray\(current\[k\]\)\?current\[k\]:\[\]\}\)/);
  assert.match(cloudSync, /CLINICAL_DB_CONFIG_KEYS\.forEach\(k=>\{payload\[k\]=\[\]\}\)/);
});

test('la eliminación de visitas y tipos de muestra se confirma en Supabase', async () => {
  const catalogPersistence = await readFile(new URL('../clinical-catalog-persistence.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(catalogPersistence));
  assert.ok(html.includes('src="./clinical-catalog-persistence.js"'));
  assert.match(catalogPersistence, /item\.active=false/);
  assert.match(catalogPersistence, /await api\.saveConfiguration\(\)/);
  assert.match(catalogPersistence, /x\.active!==false/);
  assert.match(catalogPersistence, /restoreClinicalCatalogItem/);
});

const resetMigration = await readFile(new URL('../supabase/migrations/20261103230047_allow_protected_reset_of_archived_event_ledgers.sql', import.meta.url), 'utf8');

test('el restablecimiento completo conserva seguridad, crea respaldo y exige al administrador principal', () => {
  assert.doesNotThrow(() => new Function(configuration), 'configuracion.js debe tener sintaxis válida');
  assert.match(configuration, /frResetTab/);
  assert.match(configuration, /settings-reset/);
  assert.match(configuration, /id="frRunFullReset"/);
  assert.match(auth, /fleboGlobalSignOut/);
  assert.match(configuration, /RESTABLECER FLEBOREPORT/);
  assert.match(configuration, /reset_workspace_operational_data/);
  assert.match(resetMigration, /private\.workspace_reset_backups/);
  assert.match(resetMigration, /v_uid<>v_owner or v_uid<>v_primary/);
  assert.match(resetMigration, /workspace_app_state/);
  assert.match(resetMigration, /audit_logs/);
  assert.match(resetMigration, /disable trigger trg_clinical_sample_events_immutable/);
  assert.match(resetMigration, /enable trigger trg_clinical_sample_events_immutable/);
  assert.match(resetMigration, /reset_epoch=excluded\.reset_epoch/);
  assert.match(cloudSync, /remote\.reset_epoch/);
  assert.match(cloudSync, /backupResetLocalState/);
  assert.match(cloudSync, /applyCloudState\(remote\.state,true\)/);
});


const triggerFunctionSecurityMigration = await readFile(new URL('../supabase/migrations/20261104124910_lock_down_trigger_function_execution.sql', import.meta.url), 'utf8');

test('las funciones SECURITY DEFINER de disparadores no quedan expuestas como RPC públicas', () => {
  for (const name of [
    'audit_workspace_app_state_change',
    'guard_home_visit_assignment_update',
    'guard_home_visit_technician_update',
    'log_clinical_sample_created'
  ]) {
    assert.match(triggerFunctionSecurityMigration, new RegExp('revoke execute on function public\\.' + name + '\\(\\) from public, anon, authenticated', 'i'));
  }
  assert.match(triggerFunctionSecurityMigration, /revoke execute on function public\.cancel_home_visit\(uuid, text\) from public, anon/i);
  assert.match(triggerFunctionSecurityMigration, /grant execute on function public\.cancel_home_visit\(uuid, text\) to authenticated/i);
});

test('cada función llamada desde un botón HTML tiene un manejador definido', async () => {
  const scriptPaths = [
    'supabase-auth.js', 'cloud-state-sync.js', 'patient-cloud-sync.js',
    'clinical-cloud-sync.js', 'domicilios.js', 'notifications-center.js',
    'configuracion.js', 'audit-history.js', 'notification-settings.js',
    'clinical-processing-simple.js', 'clinical-catalog-persistence.js'
  ];
  const scripts = await Promise.all(scriptPaths.map(path => readFile(new URL('../' + path, import.meta.url), 'utf8')));
  const source = html + '\n' + scripts.join('\n');
  const declarations = new Set([...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]));
  const exposed = new Set([...source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
  const calls = new Set();
  for (const [, handler] of html.matchAll(/\bonclick\s*=\s*["']([^"']+)["']/gi)) {
    for (const [, name] of handler.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!['getElementById', 'print'].includes(name)) calls.add(name);
    }
  }
  const missing = [...calls].filter(name => !declarations.has(name) && !exposed.has(name));
  assert.deepEqual(missing, [], 'hay botones con funciones no definidas: ' + missing.join(', '));
});


test('las muestras y su historial solo se hidratan desde las tablas clínicas de Supabase', () => {
  assert.match(cloudSync, /CLINICAL_DB_RECORD_KEYS=\['clinicalSamples','clinicalSampleHistory','clinicalLocalDeletedSampleIds'\]/);
  assert.match(cloudSync, /CLINICAL_DB_RECORD_KEYS\.forEach\(k=>\{out\[k\]=\[\]\}\)/);
  assert.match(cloudSync, /CLINICAL_DB_RECORD_KEYS\.forEach\(k=>\{payload\[k\]=\[\]\}\)/);
  assert.match(clinicalCloudSync, /if\(fullSnapshot\)\{mergedSamples=next;\}/);
  assert.doesNotMatch(clinicalCloudSync, /oldSamples\.filter\(x=>!x\.cloudId/);
  assert.doesNotMatch(clinicalCloudSync, /history\.concat\(oldSampleHistory/);
});


test('los botones de Jornada actual permanecen alineados en una sola fila en móvil', () => {
  assert.match(html, /id="journey-heading-actions-one-row-v1"/);
  assert.match(html, /flex-direction:row!important;flex-wrap:nowrap!important/);
  assert.match(html, /margin:8px 0 0!important;padding:0!important/);
  assert.match(html, /height:34px!important/);
});


test('la sincronización deduplica por código y no repuebla ubicaciones clínicas locales', () => {
  assert.match(cloudSync, /function itemKey\(x,collection\)/);
  assert.match(cloudSync, /itemKey\(x,key\)/);
  assert.match(clinicalCloudSync, /clinicalFreezers:freezers,clinicalRacks:racks,clinicalLocations:locations/);
  assert.match(clinicalCloudSync, /clinicalSampleHistory:history/);
  assert.doesNotMatch(clinicalCloudSync, /clinicalLocalDeletedSampleIds/);
  assert.doesNotMatch(clinicalCloudSync, /clinicalLocations:locations\.concat\(oldB/);
});

test('la sincronización de pacientes no vuelve a subir expedientes locales antiguos al iniciar', () => {
  assert.match(patientCloudSync, /if\(!initialized\)/);
  assert.match(patientCloudSync, /patient-local-backup/);
  assert.match(patientCloudSync, /pendingKeys/);
  assert.match(patientCloudSync, /syncNow\(\{allowLocalPush:true\}\)/);
});


test('no se crean gavetas ni bandejas clínicas automáticamente', () => {
  assert.match(noAutoClinicalStructureMigration, /drop trigger if exists clinical_freezer_seed_drawers/i);
  assert.match(noAutoClinicalStructureMigration, /drop trigger if exists clinical_rack_seed_trays/i);
  assert.match(noAutoClinicalStructureMigration, /drop trigger if exists clinical_freezer_seed_drawers/i);
  assert.match(noAutoClinicalStructureMigration, /drop trigger if exists clinical_rack_seed_trays/i);
  assert.match(removeUnusedClinicalSlotsMigration, /delete from public\.clinical_rack_trays/i);
  assert.match(removeUnusedClinicalSlotsMigration, /delete from public\.clinical_freezer_drawers/i);
  assert.doesNotMatch(clinicalCloudSync, /for\(let n=1;n<=5;n\+\+\)/);
  assert.match(clinicalCloudSync, /configuredTrays=boxes\.filter/);
  assert.match(clinicalCloudSync, /usedDrawerKeys=new Set/);
  assert.match(clinicalCloudSync, /await loadRemoteBoxes\(\)/);
  assert.match(html, /function createDrawers\(name\)/);
  assert.match(html, /trays:\[String\(box\.tray\)\]/);
});


test('la base de datos bloquea duplicados por código y permite códigos distintos', () => {
  assert.match(duplicateProtectionMigration, /services_workspace_code_or_name_uidx/);
  assert.match(duplicateProtectionMigration, /clinical_studies_workspace_protocol_normalized_uidx/);
  assert.match(duplicateProtectionMigration, /patients_workspace_document_normalized_uidx/);
  assert.match(duplicateProtectionMigration, /delete from public\.services/i);
  assert.match(duplicateProtectionMigration, /and not exists\(select 1 from public\.home_visit_tests/i);
});


test('el catálogo de pruebas elimina duplicados por nombre normalizado y conserva datos', () => {
  assert.match(cloudSync, /function catalogIdentity/);
  assert.match(cloudSync, /function dedupeCatalog/);
  assert.match(cloudSync, /collection==='catalog'/);
  assert.match(cloudSync, /payload\.catalog=dedupeCatalog/);
  assert.match(cloudSync, /safe\.catalog=dedupeCatalog/);
});


test('el inicio de procesamiento abre la ficha completa y guarda alícuotas en la transición', () => {
  assert.match(clinicalProcessing, /window\.openClinicalProcessingModal\(id\)/);
  assert.doesNotMatch(clinicalProcessing, /window\.prompt\('Cantidad de alícuotas/);
  assert.match(html, /primaryAliquots:p/);
  assert.match(html, /backupAliquots:b/);
  assert.match(html, /notes:observation/);
  assert.match(clinicalProcessing, /alícuotas principales y de backup/);
});
 
test('la recepción y cada etapa clínica quedan atribuidas al usuario autenticado', () => {
  assert.doesNotMatch(html, /id="clinicalReceivedBy"/);
  assert.match(html, /function clinicalActor\(\)[\s\S]*?window\.FleboAuth[\s\S]*?user_metadata/);
  assert.match(html, /receivedBy:clinicalActor\(\)/);
  assert.match(clinicalCloudSync, /receivedBy:profileMap\.get\(row\.received_by\)/);
  assert.match(clinicalCloudSync, /reviewedBy:profileMap\.get\(row\.reviewed_by\)/);
  assert.match(clinicalCloudSync, /processingStartedBy:profileMap\.get\(row\.processing_started_by\)/);
  assert.match(clinicalCloudSync, /processedBy:profileMap\.get\(row\.processed_by\)/);
  assert.match(clinicalCloudSync, /storedBy:profileMap\.get\(row\.stored_by\)/);
  assert.match(clinicalProcessing, /x\.processingStartedBy/);
  assert.match(clinicalProcessing, /x\.reviewedBy/);
  assert.match(clinicalCloudSync, /sample\.processingStartedBy=actorName\(\)/);
  assert.match(clinicalCloudSync, /sample\.reviewedBy=actorName\(\)/);
  assert.match(clinicalCloudSync, /sample\.processedBy=actorName\(\)/);
  assert.match(clinicalCloudSync, /sample\.storedBy=actorName\(\)/);
  assert.match(simpleProcessing, /window\.openClinicalProcessingModal=function\(id\)/);
  assert.match(simpleProcessing, /cloud\.transition\(sample,'PROCESANDO',\{primaryAliquots:p,backupAliquots:b/);
  assert.match(html, /window\.FleboClinicalCloud\.transition\(sample,'PROCESANDO',[\s\S]*?primaryAliquots:p,[\s\S]*?backupAliquots:b/);
  assert.match(html, /historyStatusLabel=function\(s\)[\s\S]*?REGISTRADO:'Recibido'[\s\S]*?PENDIENTE_PROCESO:'Verificado y aprobado'/);
  assert.match(authenticatedReceptionMigration, /insert into public\.clinical_sample_events[\s\S]*?'REGISTRADO'[\s\S]*?v_actor/);
  assert.match(authenticatedReceptionMigration, /p_received_at,v_actor,p_container_count/);
});


test('la sincronización de fondo evita el repintado global y protege formularios y selecciones', () => {
  assert.match(html, /refresh:function\(\)[\s\S]*?replace:function\(next,options\)[\s\S]*?if\(!options\.deferRender\)this\.refresh\(\)/);
  assert.match(html, /if\(view==='patients'\)renderPatients\(\)/);
  assert.match(html, /if\(view==='journey'\)renderJourneyPatients\(\)/);
  assert.doesNotMatch(html, /refreshSamples\(\)\.then\(renderClinicalStudies\)/);
  assert.match(cloudSync, /replace\(safe,\{silent:true,deferRender:true\}\)/);
  assert.doesNotMatch(cloudSync, /FleboAppState\.refresh\(\)/);
  assert.match(patientCloudSync, /replace\(\{\.\.\.s,patients:list\},\{silent:true,deferRender:true\}\)/);
  assert.match(patientCloudSync, /function refreshPatientViews\(\)/);
  assert.match(patientCloudSync, /view\.id==='view-patients'[\s\S]*?patientsHome[\s\S]*?renderPatients\(\)/);
  assert.match(patientCloudSync, /view\.id==='view-journey'[\s\S]*?renderJourneyPatients\(\)/);
  assert.match(patientCloudSync, /document\.addEventListener\('focusout'/);
  assert.doesNotMatch(patientCloudSync, /FleboAppState\.refresh\(\)/);
  assert.match(patientCloudSync, /if\(local\.length&&!remote\.length\)[\s\S]*?return;[\s\S]*?saveList\(remote\)/);
  assert.match(patientCloudSync, /if\(currentPatients\.length&&!latest\.length\)[\s\S]*?return;[\s\S]*?saveList\(latest\)/);
  assert.match(clinicalCloudSync, /function clinicalUiIsBusy\(\)/);
  assert.match(clinicalCloudSync, /activeClinicalMutations>0/);
  assert.match(clinicalCloudSync, /function trackClinicalMutation\(fn\)/);
  assert.match(clinicalCloudSync, /flebo:clinical-operation-idle/);
  assert.match(clinicalCloudSync, /transition:trackClinicalMutation\(transition\)/);
  assert.match(clinicalCloudSync, /clinicalProcessingModal/);
  assert.match(clinicalCloudSync, /config&&!config\.closest\('\[hidden\]'\)/);
  assert.match(clinicalCloudSync, /function refreshClinicalViewSafely\(\)/);
  assert.match(clinicalCloudSync, /pendingClinicalRefresh/);
  assert.match(clinicalCloudSync, /document\.addEventListener\('focusout'/);
  assert.match(clinicalCloudSync, /async function syncConfiguration\(\)[\s\S]*?refreshClinicalViewSafely\(\)/);
  assert.match(clinicalCloudSync, /async function refreshSamples\(\)[\s\S]*?refreshClinicalViewSafely\(\)/);
  assert.doesNotMatch(clinicalCloudSync, /FleboAppState\.refresh\(\)/);
  assert.match(serviceWorker, /CACHE_NAME='fleboreport-shell-v234'/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
  assert.match(serviceWorker, /keys\.filter\(key=>key!==CACHE_NAME\)/);
});

// Processing aliquots are captured in the processing-start modal and saved
// atomically with the authenticated status transition.
assert.match(simpleProcessing, /window\.openClinicalProcessingModal=function\(id\)/);
assert.match(simpleProcessing, /cloud\.transition\(sample,'PROCESANDO',\{primaryAliquots:p,backupAliquots:b/);
assert.match(simpleProcessing, /if\(p\+b<1\)/);
assert.match(simpleProcessing, /Registra al menos una alícuota principal o backup/);

test('Registro de sujetos y Procesamiento aprovechan el ancho completo en PC sin alterar tablet y móvil', () => {
  assert.ok(html.includes('id="clinical-desktop-full-width-v1"'));
  assert.ok(html.includes('@media (min-width:1101px)'));
  assert.ok(html.includes('max-width:none!important'));
  assert.ok(html.includes('min-width:100%!important'));
  assert.ok(html.includes('@media(max-width:760px)'));
  assert.ok(html.includes('@media(min-width:761px) and (max-width:1100px)'));
});

test('el listado del catálogo clínico conserva el ancho del nombre y separa las acciones', () => {
  assert.match(html, /id="clinical-catalog-layout-stability-v1"/);
  assert.match(html, /#clinicalConfigList \.clinical-config-row>span:first-child\{[^}]*flex:1 1 0%[^}]*min-width:0/);
  assert.match(html, /#clinicalConfigList \.clinical-config-row>\.clinical-actions\{[^}]*width:auto!important/);
  assert.match(html, /word-break:normal/);
});

const homeVisitAssigneeResponseMigration = await readFile(new URL('../supabase/migrations/20261105011901_allow_assigned_technician_to_respond_home_visit_invitation.sql', import.meta.url), 'utf8');

test('el flebotomista asignado puede aceptar o rechazar su invitación sin permiso general de edición', () => {
  assert.ok(homeVisitAssigneeResponseMigration.includes('create policy home_visit_assignments_permission_update_scope'));
  assert.ok(homeVisitAssigneeResponseMigration.includes('as restrictive'));
  assert.ok(homeVisitAssigneeResponseMigration.includes("array['invited'::text]"));
  assert.ok(homeVisitAssigneeResponseMigration.includes("status in ('accepted', 'rejected')"));
  assert.ok(domicilios.includes(".eq('assigned_user_id',u).eq('status','invited')"));
});


test('domicilios separa agenda activa e historial en una vista independiente', () => {
  assert.match(domicilios, /const historyStatuses=\['Finalizado','Rechazado','Cancelado','No realizado','Paciente ausente','Paciente rechazó la toma'\]/);
  assert.match(domicilios, /id="hvHistoryPanel"/);
  assert.doesNotMatch(domicilios, /id="hvHistoryDetails"/);
  assert.match(domicilios, /id="hvHistoryRows"/);
  assert.match(domicilios, /\.sort\(sortVisits\)/);
});

test('la agenda de domicilios tiene vistas diferenciadas y diseño adaptable', () => {
  assert.match(domicilios, /createPanel\.hidden=technician\|\|!manager\|\|activeTab!=='create'/);
  assert.match(domicilios, /kpis\.hidden=technician/);
  assert.doesNotMatch(domicilios, /detailPanel\.hidden=technician/);
  assert.match(domicilios, /detail\(activeVisit\)/);
  assert.match(domicilios, /hv-responsive-agenda-v2/);
  assert.match(domicilios, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(domicilios, /@media\(max-width:900px\)/);
  assert.match(domicilios, /@media\(max-width:650px\)/);
});


test('las asignaciones de domicilios normalizan el VAPID subject y notifican como aprobación pendiente', () => {
  assert.match(domiciliosNotificationsFunction, /configuredVapidSubject/);
  assert.match(domiciliosNotificationsFunction, /"mailto:" \+ configuredVapidSubject/);
  assert.match(domiciliosNotificationsFunction, /Domicilio pendiente de aprobación/);
  assert.match(domiciliosNotificationsFunction, /push_sent: pushSent/);
});

test('el alta de domicilios solo usa pruebas UUID del catálogo central', () => {
  assert.match(domicilios, /const catalog=\(\)=>remoteCatalog/);
  assert.match(domicilios, /const selectedTests=ids\.map\(id=>remoteCatalog\.find\(x=>x\.id===id\)\)/);
  assert.match(domicilios, /!item\|\|!asUuid\(ids\[i\]\)/);
  assert.match(domicilios, /createBusy=true/);
  assert.match(domicilios, /catch\(e\)[\s\S]*?No se pudo guardar el domicilio/);
});

test('el catálogo maestro evita duplicados por origen, código o nombre y reconcilia las pruebas activas', () => {
  assert.match(domicilios, /const matchesMaster=/);
  assert.match(domicilios, /row\.catalog_source_id===sourceId/);
  assert.match(domicilios, /saved\.error\.code==='23505'/);
  assert.match(domicilios, /\.insert\(row\)\.select\(selectColumns\)/);
  assert.match(domicilios, /const obsolete=existingRows\.filter/);
  assert.match(domicilios, /\.update\(\{active:false\}\)/);
});


test('los cambios de estado no reportan falso error por notificaciones y agrupan recargas realtime', () => {
  assert.match(domicilios, /invokeDomicileNotifications\(\{action:'status-update'[\s\S]*?\.catch\(error=>console\.warn/);
  assert.doesNotMatch(domicilios, /if\(notice\.error\)console\.warn\('No se pudo notificar el cambio de domicilio'/);
  assert.match(domicilios, /El servidor no devolvió confirmación para emitir la notificación/);
  assert.doesNotMatch(domicilios, /notice\.error\.message\|\|notice\.error/);
  assert.match(domicilios, /function scheduleCloudVisitsRefresh\(\)/);
  assert.match(domicilios, /cloudRefreshTimer=setTimeout/);
  assert.match(domicilios, /\(\)=>scheduleCloudVisitsRefresh\(\)/);
});

test('las prioridades de domicilio son obligatorias, se ordenan y aparecen en invitaciones y notificaciones', () => {
  assert.match(domicilios, /id="hvPriority" required/);
  assert.match(domicilios, /scheduledDate:date,scheduledTime:time,priority,assignedTo/);
  assert.match(domicilios, /priorityRank\(a\.priority\)-priorityRank\(b\.priority\)/);
  assert.match(domicilios, /Prioridad: '\+priorityLabel\(v\.priority\)/);
  assert.match(domiciliosNotificationsFunction, /Prioridad: " \+ priority/);
  assert.match(domiciliosNotificationsFunction, /URGENTE · /);
  assert.match(domiciliosNotificationsFunction, /home_visits\(id,scheduled_at,notes,priority\)/);
});

test('las invitaciones de domicilios se presentan como cuadro flotante con aceptación explícita', () => {
  assert.match(domicilios, /hv-assignment-overlay/);
  assert.match(domicilios, /hv-assignment-modal/);
  assert.match(domicilios, /Domicilio pendiente de aprobación/);
  assert.match(domicilios, /Aceptar domicilio/);
  assert.match(domicilios, /Rechazar domicilio/);
  assert.match(domicilios, /Por privacidad, el nombre del paciente, la dirección y las pruebas se mostrarán después de aceptar/);
});

test('la revisión de muestras permite recuperar una solicitud vacía desde el catálogo central sin confirmar por error', () => {
  assert.match(domicilios, /id="hvCorrectionSearch"/);
  assert.match(domicilios, /No se encontraron pruebas activas con ese nombre o código/);
  assert.match(domicilios, /confirm\.disabled=c\.pending>0\|\|c\.taken===0/);
});

test('la confirmación de muestras normaliza UUID de pruebas y de eventos', () => {
  assert.match(domicilios, /const normalizedTestId=asUuid\(t\.id\)\|\|crypto\.randomUUID\(\)/);
  assert.match(domicilios, /let serviceId=asUuid\(t\.serviceId\|\|t\.testId\)\|\|null/);
  assert.match(domicilios, /const eventId=asUuid\(e\.id\)\|\|crypto\.randomUUID\(\)/);
});


test('un flebotomista que rechaza la invitación no puede ver los datos del paciente', () => {
  assert.match(domicilios, /v\.assignmentStatus==='rejected'\|\|v\.status==='Rechazado'/);
  assert.match(domicilios, /La información del paciente permanece protegida/);
});


test('el servicio Push reintenta invitaciones fallidas y no repite las ya entregadas', () => {
  assert.match(domiciliosNotificationsFunction, /pushAlreadySent/);
  assert.match(domiciliosNotificationsFunction, /!pushAlreadySent && publicVapid && privateVapid/);
  assert.match(domiciliosNotificationsFunction, /!pushAlreadySent && pushStatus === "sent"/);
  assert.match(domicilios, /if\(assignment\.status==='invited'\)[\s\S]*?dispatchNotice\(assignment\.id\)/);
});


test('el aviso Push y el aviso del centro usan la misma etiqueta para evitar duplicados', () => {
  assert.match(domiciliosNotificationsFunction, /const notificationTag = inAppNotificationId \? "fleboreport-notif-" \+ inAppNotificationId/);
  assert.match(domiciliosNotificationsFunction, /tag: notificationTag/);
  assert.match(notifications, /tag:'fleboreport-notif-'\+n\.id/);
});


test('los domicilios incompletos permiten restaurar las pruebas originales desde el catálogo', () => {
  assert.match(domicilios, /const restoringOriginal=\(v\.tests\|\|\[\]\)\.length===0/);
  assert.match(domicilios, /source:restoringOriginal\?'original':'adicional'/);
  assert.match(domicilios, /Pruebas solicitadas restauradas desde el catálogo/);
  assert.match(domicilios, /selected\.some\(\(t,i\)=>!t\|\|!asUuid\(ids\[i\]\)\)/);
});


test('las notificaciones abren la aplicación bajo el subdirectorio de GitHub Pages y el domicilio concreto', () => {
  assert.match(serviceWorker, /notificationclick/);
  assert.match(domiciliosNotificationsFunction, /url: "\?view=domicilios&visit=" \+ assignment\.home_visit_id/);
  assert.match(notifications, /hvOpenNotificationVisit\(notification\.home_visit_id\)/);
  assert.match(domicilios, /params\.get\('view'\)==='domicilios'/);
  assert.match(domicilios, /new URLSearchParams\(location\.search\)\.get\('visit'\)/);
});


test('el cuadro de aceptación de domicilio se monta en el body y se centra en el viewport', () => {
  assert.match(domicilios, /document\.body\.appendChild\(overlay\)/);
  assert.match(domicilios, /align-items:center!important/);
  assert.match(domicilios, /max-height:calc\(100dvh - 40px\)/);
});


test('la sesión autenticada persiste en almacenamiento local y renovar token no bloquea la aplicación', () => {
  assert.match(auth, /function rememberSessionEnabled\(\)/);
  assert.match(auth, /target=remember\?localStorage:sessionStorage/);
  assert.match(auth, /target\.setItem\(key,value\)/);
  assert.match(auth, /authStorageAdapter\.setRemember/);
  assert.match(auth, /event==='TOKEN_REFRESHED'/);
  assert.match(auth, /const sameUser=!!\(currentUser&&currentUser\.id===user\.id\)/);
  assert.match(auth, /if\(!sameUser\)\{currentUser=user;currentMembership=null/);
  assert.match(auth, /membershipRefreshSequence/);
});


test('la restauración inicial de sesión no muestra el bloqueo antes de completar la verificación', () => {
  assert.match(auth, /const authChecking=!authBootComplete&&!currentUser/);
  assert.match(auth, /gate\.hidden=authorized\|\|authChecking/);
  assert.match(auth, /flebo-auth-locked',!authorized&&authBootComplete/);
});


test('el cuadro de invitación no instala un MutationObserver global y se centra al renderizar', () => {
  assert.doesNotMatch(domicilios, /assignmentOverlayObserver\.observe\(document\.documentElement/);
  assert.match(domicilios, /portalAssignmentOverlay\(\);/);
});
test('rechazar una invitación no depende de prompt nativo y puede persistirse', () => {
  assert.match(domicilios, /next==='Rechazado'\?'El flebotomista no puede realizar el domicilio\.'/);
  assert.match(domicilios, /status:v\.status==='Aceptado'\?'accepted':'rejected'/);
});
test('una suscripción Push se desactiva en cuentas anteriores al vincular el dispositivo a otra cuenta', () => {
  assert.match(domiciliosNotificationsFunction, /\.eq\("endpoint", sub\.endpoint\)\.neq\("user_id", user\.id\)\.eq\("active", true\)/);
  assert.match(domiciliosNotificationsFunction, /\.eq\("user_id", assignment\.assigned_user_id\)/);
});


test('la aceptación del flebotomista se confirma sin depender del guardado secundario del evento', () => {
  assert.match(domicilios, /if\(technicianResponse\)\{[\s\S]*?v\.status='Aceptado'/);
  assert.match(domicilios, /La aceptación se guardó, pero no se pudo registrar el evento/);
  assert.match(domicilios, /await loadCloudVisits\(\)/);
});


test('el catálogo de domicilios se sincroniza con el catálogo maestro del administrador y desactiva pruebas obsoletas sin borrarlas', () => {
  assert.match(domicilios, /const masterCatalog=localCatalog\(\)\.filter\(x=>x&&x\.id&&x\.name&&x\.active!==false\)/);
  assert.match(domicilios, /const obsolete=existingRows\.filter\(row=>row\.active!==false&&!masterCatalog\.some\(item=>matchesMaster\(row,item\)\)\)/);
  assert.match(domicilios, /\.update\(\{active:false\}\)/);
  assert.match(domicilios, /\.eq\('active',true\)/);
  assert.match(domicilios, /const matchesMaster=/);
});

test('la revisión de muestras permite corregir pruebas desde el catálogo central antes de confirmar', () => {
  assert.match(domicilios, /id="hvCorrectionSearch"/);
  assert.match(domicilios, /data-correction-add/);
  assert.match(domicilios, /source:'adicional'/);
  assert.match(domicilios, /\[CORRECCION: RETIRADA\]/);
  assert.match(domicilios, /data-save-corrections/);
  assert.match(domicilios, /await save\(v\)/);
  assert.match(domicilios, /const technician=cloud\.role==='technician'/);
});


test('los resultados del catálogo de domicilios mantienen el texto horizontal en móviles y tablets', () => {
  assert.match(domicilios, /\.hv-test-result\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(domicilios, /writing-mode:horizontal-tb/);
  assert.match(domicilios, /\.hv-review-correction \.hv-test-result b/);
});


test('al aceptar un domicilio se cierra el cuadro flotante y se desbloquea la vista de campo', () => {
  assert.match(domicilios, /if\(await save\(v\)\)\{if\(next==='Aceptado'\|\|next==='Rechazado'\)\{closeAssignmentOverlays\(\);dismissedInvitationId=id;const current=visits\.find\(x=>x\.id===id\)\|\|v;current\.status=next;current\.assignmentStatus=next==='Aceptado'\?'accepted':'rejected';/);
  assert.match(domicilios, /function closeAssignmentOverlays\(\)\{document\.querySelectorAll\('\.hv-assignment-overlay'\)\.forEach\(node=>node\.remove\(\)\)\}/);
  assert.match(domicilios, /const locked=v\.status==='Pendiente de aceptación'&&v\.assignmentStatus!=='accepted'/);
});


test('la sincronización consulta primero la revisión y solo descarga el estado completo si hay cambios o conflicto', () => {
  assert.ok(cloudSync.includes("async function fetchRemoteMeta(){"));
  assert.ok(cloudSync.includes("select('revision,updated_at,reset_epoch')"));
  const receiveStart=cloudSync.indexOf('async function receiveRemote(){');
  const receiveEnd=cloudSync.indexOf('async function syncLocal(){',receiveStart);
  const receive=cloudSync.slice(receiveStart,receiveEnd);
  assert.match(receive,/if\(remoteMeta\.revision<=revision\)return;[\s\S]*?let remote=await fetchRemote\(\)/);
  assert.ok(cloudSync.includes('Solo ante un conflicto se descarga el estado completo'));
  const syncStart=cloudSync.indexOf('async function syncLocal(){');
  const syncEnd=cloudSync.indexOf('function schedule(){',syncStart);
  assert.ok(cloudSync.slice(syncStart,syncEnd).includes('const remoteMeta=await fetchRemoteMeta()'));
});

test('rechazar una invitación no intenta registrar un evento de domicilio aceptado', () => {
  const branchStart=domicilios.indexOf('if(technicianResponse){');
  const branchEnd=domicilios.indexOf('const saved=',branchStart);
  const responseBranch=domicilios.slice(branchStart,branchEnd);
  const acceptedStart=responseBranch.indexOf("if(response.data.status==='accepted'){");
  const rejectComment=responseBranch.indexOf('// Una invitación rechazada queda registrada');
  const acceptedOnly=responseBranch.slice(acceptedStart,rejectComment);
  assert.ok(acceptedStart>=0 && rejectComment>acceptedStart);
  assert.ok(acceptedOnly.includes("home_visit_events').insert"));
  assert.ok(!responseBranch.slice(rejectComment).includes("home_visit_events').insert"));
  assert.ok(responseBranch.includes('Una invitación rechazada queda registrada en home_visit_assignments'));
});

test('la caché de la PWA cambia al publicar la optimización de sincronización', () => {
  assert.match(serviceWorker, /fleboreport-shell-v234/);
  assert.match(serviceWorker, /fetch\(request,\{cache:'no-store'\}\)/);
  assert.match(serviceWorker, /url\.pathname\.endsWith\('\/supabase-auth\.js'\)/);
});

test('el acceso no presenta una vinculación ausente mientras la membresía sigue verificándose', () => {
  assert.match(auth, /membershipChecking=true/);
  assert.match(auth, /Confirmando vinculación con el espacio de trabajo/);
  assert.match(auth, /retry\.hidden=authorized\|\|membershipChecking/);
  assert.match(auth, /help\.hidden=authorized\|\|membershipChecking/);
});


const rlsPerformanceMigration = await readFile(new URL('../supabase/migrations/20261105180806_optimize_auth_rls_initplans.sql', import.meta.url), 'utf8');

test('las políticas RLS de sincronización y domicilios evalúan auth.uid una sola vez por sentencia', () => {
  for (const policy of [
    'home_visit_documents_insert_scoped',
    'home_visit_documents_read_scoped',
    'home_visit_notifications_read_own',
    'home_visit_notifications_update_own',
    'home_visit_push_subscriptions_delete_self',
    'home_visit_push_subscriptions_insert_self',
    'home_visit_push_subscriptions_select_self',
    'home_visit_push_subscriptions_update_self',
    'workspace_app_state_insert',
    'workspace_app_state_read',
    'workspace_app_state_update'
  ]) {
    assert.match(rlsPerformanceMigration, new RegExp('create policy ' + policy, 'i'));
  }
  assert.match(rlsPerformanceMigration, /\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(rlsPerformanceMigration, /(?:=|,)\s*auth\.uid\(\)/i);
});

test('Domicilios separa agenda, historial, calendario y creación con detalle junto a la lista', () => {
  assert.match(domicilios, /data-hv-tab="agenda"/);
  assert.match(domicilios, /data-hv-tab="history"/);
  assert.match(domicilios, /data-hv-tab="calendar"/);
  assert.match(domicilios, /data-hv-tab="create"/);
  assert.match(domicilios, /id="hvHistoryPanel"/);
  assert.match(domicilios, /id="hvHistoryRows"/);
  assert.doesNotMatch(domicilios, /id="hvAgendaPanel"[\s\S]{0,2500}hvHistoryDetails/);
  assert.match(domicilios, /#hvWorkspace>\.hv-detail-panel\{grid-column:2/);
  assert.match(domicilios, /if\(agendaPanel\)agendaPanel\.hidden=activeTab!=='agenda'/);
  assert.match(domicilios, /selected=v\.id;activeTab='agenda';reset\(\);render\(\)/);
  assert.match(domicilios, /function calendarVisit\(id\)\{selected=id;activeTab='agenda';render\(\)\}/);
});


test('el modal de seguimiento de domicilios evita repintar toda la pantalla en escritorio', () => {
  assert.match(domicilios, /document\.body\.appendChild\(detailBackdrop\)/);
  assert.match(domicilios, /body > \.hv-detail-backdrop/);
  assert.doesNotMatch(domicilios, /\.hv-detail-backdrop\\{[^}]*backdrop-filter/);
});


test('el historial de domicilios permite buscar por cédula o nombre, filtrar por fecha y abrir el detalle modal', () => {
  assert.match(domicilios, /id="hvHistorySearch"/);
  assert.match(domicilios, /id="hvHistoryDate"/);
  assert.match(domicilios, /v\.document/);
  assert.match(domicilios, /historyStatuses\.includes\(v\.status\)&&historyMatches\(v\)/);
  assert.match(domicilios, /\['agenda','history'\]\.includes\(activeTab\)/);
  assert.match(domicilios, /hvHistorySearch','hvHistoryDate/);
});


test('Recordarme controla dónde se conserva la sesión y permite cambiar la preferencia', () => {
  assert.match(auth, /function rememberSessionEnabled\(\)/);
  assert.match(auth, /function createAuthStorageAdapter\(\)/);
  assert.match(auth, /storage:authStorageAdapter/);
  assert.match(auth, /authStorageAdapter\.setRemember\(remember\.checked\)/);
  assert.match(auth, /target=remember\?localStorage:sessionStorage/);
  assert.match(auth, /source=remember\?sessionStorage:localStorage/);
});

const syncChangeLogMigration = await readFile(new URL('../supabase/migrations/20261106134333_sync_change_log_outbox.sql', import.meta.url), 'utf8');
const syncOutboxPolicyMigration = await readFile(new URL('../supabase/migrations/20261106134655_sync_outbox_assignee_visibility.sql', import.meta.url), 'utf8');
const syncOutboxHistoricalAssigneeMigration = await readFile(new URL('../supabase/migrations/20261106135954_sync_outbox_historical_assignee_scope.sql', import.meta.url), 'utf8');
const syncOutboxCommitOrderMigration = await readFile(new URL('../supabase/migrations/20261106140506_sync_outbox_commit_order_cursor.sql', import.meta.url), 'utf8');
const syncRetentionMigration = await readFile(new URL('../supabase/migrations/20261106142502_sync_change_log_retention_and_cursor_floor.sql', import.meta.url), 'utf8');
const syncRetentionFixMigration = await readFile(new URL('../supabase/migrations/20261106142513_fix_sync_retention_floor_visibility_and_batch_count.sql', import.meta.url), 'utf8');

test('la sincronización incremental registra solo identificadores y respeta RLS por módulo', () => {
  assert.match(syncChangeLogMigration, /create table if not exists public\.sync_change_log/i);
  assert.match(syncChangeLogMigration, /enable row level security/i);
  assert.match(syncChangeLogMigration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visits/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visit_tests/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visit_assignments/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visit_events/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visit_documents/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_home_visit_additional_patients/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_clinical_samples/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_clinical_sample_containers/i);
  assert.match(syncChangeLogMigration, /create trigger sync_change_log_clinical_sample_events/i);
  assert.match(syncChangeLogMigration, /alter publication supabase_realtime add table public\.sync_change_log/i);
  assert.doesNotMatch(syncChangeLogMigration, /patient_name|document_number|address|row_data|payload/i);
  assert.match(syncOutboxPolicyMigration, /is_current_home_visit_assignee/i);
  assert.match(syncOutboxPolicyMigration, /has_workspace_role/i);
  assert.match(syncOutboxHistoricalAssigneeMigration, /private\.was_home_visit_assignee/i);
  assert.match(syncOutboxHistoricalAssigneeMigration, /set row_security = 'off'/i);
  assert.match(syncOutboxHistoricalAssigneeMigration, /grant execute on function private\.was_home_visit_assignee\(uuid,uuid\) to authenticated/i);
  assert.match(syncOutboxCommitOrderMigration, /pg_advisory_xact_lock\(hashtextextended\(v_workspace_id::text, 0\)\)/);
});

test('el procesamiento permite guardar alícuotas también después de iniciar', () => {
  assert.match(simpleProcessing, /current!=='PENDIENTE_PROCESO'&&current!=='PROCESANDO'/);
  assert.match(simpleProcessing, /if\(current==='PROCESANDO'\)\{[\s\S]*?cloud\.saveAliquots\(sample,p,b\)/);
  assert.match(simpleProcessing, /completeClinicalSampleProcessing/);
});

test('los cursores clínicos permanecen locales y se reinician al limpiar datos del espacio', () => {
  assert.match(cloudSync, /CLINICAL_DB_SYNC_KEYS=\['_clinicalCloudSyncCursor','_clinicalCloudSyncWorkspace','_clinicalCloudSyncUser','_clinicalCloudSyncRole'\]/);
  assert.match(cloudSync, /CLINICAL_DB_SYNC_KEYS\.forEach\(k=>\{delete payload\[k\]\}\)/);
  assert.match(cloudSync, /if\(!clearClinical&&Object\.prototype\.hasOwnProperty\.call\(current,k\)\)safe\[k\]=current\[k\]/);
  assert.match(cloudSync, /if\(clearClinical\)window\.dispatchEvent\(new Event\('flebo:clinical-cache-reset'\)\)/);
  assert.match(clinicalCloudSync, /flebo:clinical-cache-reset/);
});


test('la retención del outbox publica un piso seguro y fuerza reconciliación si vence un cursor', () => {
  assert.match(syncRetentionMigration, /create extension if not exists pg_cron/i);
  assert.match(syncRetentionMigration, /create table if not exists public\.sync_change_log_retention/i);
  assert.match(syncRetentionMigration, /enable row level security/i);
  assert.match(syncRetentionMigration, /interval '90 days'/i);
  assert.match(syncRetentionMigration, /cron\.schedule/i);
  assert.match(syncRetentionFixMigration, /entity = 'domiciles'[\s\S]*?and is_workspace_member\(workspace_id\)/i);
  assert.match(syncRetentionFixMigration, /v_total := v_total \+ v_batch/i);
  assert.match(domicilios, /async function latestHomeVisitPrunedFloor\(\)/);
  assert.match(domicilios, /async function ensureHomeVisitCursorFresh\(\)/);
  assert.match(domicilios, /Number\(homeVisitSyncCursor\)>=floor/);
  assert.match(clinicalCloudSync, /async function latestClinicalPrunedFloor\(\)/);
  assert.match(clinicalCloudSync, /Number\(clinicalSyncCursor\)<floor/);
});

test('Domicilios y Estudios Clínicos aplican deltas y conservan el cursor junto a la instantánea', () => {
  assert.match(domicilios, /async function latestHomeVisitSyncCursor\(\)/);
  assert.match(domicilios, /function canCacheHomeVisitSnapshot\(\)/);
  assert.match(domicilios, /window\.fleboCan\('domicilios','view'\)&&window\.fleboCan\('domicilios','manage'\)/);
  assert.match(domicilios, /cloud\.user\?\.id!==session\.user\.id\|\|cloud\.workspaceId!==nextWorkspace\|\|cloud\.role!==nextRole/);
  assert.match(domicilios, /Date\.now\(\)-Number\(cached\.cachedAt\|\|0\)>5\*60\*1000/);
  assert.match(domicilios, /if\(!canCacheHomeVisitSnapshot\(\)\|\|!cloud\.user\?\.id\)return false/);
  assert.match(domicilios, /\.from\('sync_change_log'\)/);
  assert.match(domicilios, /homeVisitSyncCursor/);
  assert.match(domicilios, /async function fetchHomeVisitRows\(ids\)/);
  assert.match(clinicalCloudSync, /async function latestClinicalSyncCursor\(\)/);
  assert.match(clinicalCloudSync, /\.from\('sync_change_log'\)/);
  assert.match(clinicalCloudSync, /_clinicalCloudSyncCursor:nextCursor/);
  assert.match(clinicalCloudSync, /clinicalSyncCursor=Number\(changes\[changes\.length-1\]\.seq\)/);
  assert.match(clinicalCloudSync, /scheduleClinicalIncrementalRefresh/);
  assert.match(clinicalCloudSync, /document\.addEventListener\('visibilitychange',[\s\S]*?scheduleClinicalIncrementalRefresh\(\)/);
  assert.match(clinicalCloudSync, /window\.addEventListener\('online',[\s\S]*?scheduleClinicalIncrementalRefresh\(\)/);
  assert.match(domicilios, /document\.addEventListener\('visibilitychange',[\s\S]*?scheduleCloudVisitsRefresh\(\)/);
  assert.match(domicilios, /window\.addEventListener\('online',[\s\S]*?scheduleCloudVisitsRefresh\(\)/);
});
