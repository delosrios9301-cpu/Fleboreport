import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cloud = await readFile(new URL('../cloud-state-sync.js', import.meta.url), 'utf8');
const activity = await readFile(new URL('../app-activity-cloud.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261105185219_separate_client_activity_from_workspace_sync.sql', import.meta.url), 'utf8');
const policy = await readFile(new URL('../supabase/migrations/20261105185243_allow_client_activity_audit_insert.sql', import.meta.url), 'utf8');
const grant = await readFile(new URL('../supabase/migrations/20261105185251_grant_authenticated_audit_insert.sql', import.meta.url), 'utf8');
const history = await readFile(new URL('../audit-history.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const visual = await readFile(new URL('../fleboreport-v2.css', import.meta.url), 'utf8');

test('legacy activity is backfilled to the central immutable audit ledger with idempotency keys', () => {
  assert.ok(migration.includes('source_event_key'));
  assert.ok(migration.includes('audit_logs_source_event_key_uidx'));
  assert.ok(migration.includes('jsonb_array_elements'));
  assert.ok(migration.includes('legacy_client_audit_log'));
  assert.ok(migration.includes('on conflict (source_event_key) do nothing'));
  assert.ok(policy.includes("entity_table = 'app_activity'"));
  assert.ok(policy.includes('actor_id = (select auth.uid())'));
  assert.ok(grant.includes('grant insert on table public.audit_logs to authenticated'));
});

test('general cloud state excludes the activity ledger and keeps a pending queue', () => {
  const start = cloud.indexOf('const ARRAY_KEYS');
  const end = cloud.indexOf(';', start);
  assert.ok(start >= 0 && end > start);
  assert.ok(!cloud.slice(start, end).includes('auditLog'));
  assert.ok(cloud.includes('function stripLegacyAudit'));
  assert.ok(cloud.includes('function persistLegacyAuditEvents'));
  assert.ok(cloud.includes("source_event_key:'client:'"));
  assert.ok(activity.includes('window.auditAdd=auditAdd'));
  assert.ok(activity.includes('fleboreport.appActivityQueue.v1'));
  assert.ok(activity.includes('flebo:cloud-sync-ready'));
});

test('unified audit history exposes the migrated application activity module', () => {
  assert.ok(history.includes("['application','Actividad general']"));
  assert.ok(history.includes('value="application"'));
  assert.ok(history.includes('r.details&&r.details.section'));
  assert.ok(html.includes('app-activity-cloud.js'));
  assert.ok(sw.includes('fleboreport-shell-v278'));
  assert.ok(html.includes('fleboreport-v2.css?v=20261112-clinical-premium7'));
  assert.ok(html.includes('clinical-premium-screen-models.css?v=20261112-premium-models2'));
  assert.ok(sw.includes('clinical-premium-screen-models.css'));
  assert.ok(sw.includes('./app-activity-cloud.js'));
});


test('premium touch navigation is horizontal, accessible and non-destructive', () => {
  assert.ok(visual.includes('scroll-snap-type:x proximity'));
  assert.ok(visual.includes('overscroll-behavior-x:contain'));
  assert.ok(visual.includes('prefers-reduced-motion:reduce'));
  assert.ok(visual.includes('focus-visible'));
  assert.ok(!visual.includes('touchstart'));
  assert.ok(!visual.includes('pointerdown'));
});
