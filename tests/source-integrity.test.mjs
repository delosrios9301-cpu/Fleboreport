import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261101000000_initial_schema.sql', import.meta.url), 'utf8');

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
  assert.match(homeVisitMigration, /array\['admin','clinician','reception','viewer'\]/);
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
  assert.match(homeVisitMigration, /stamp_home_visit_event/i);\n  assert.match(homeVisitMigration, /home_visit_tests_insert_staff_only/i);\n  assert.match(homeVisitMigration, /stamp_home_visit_test_creator/i);
});
