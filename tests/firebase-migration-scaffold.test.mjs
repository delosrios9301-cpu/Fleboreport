import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bootstrap = await readFile(new URL('../firebase-bootstrap.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const plan = await readFile(new URL('../docs/FIREBASE_MIGRATION_PLAN.md', import.meta.url), 'utf8');

test('Firebase bootstrap is isolated and validates the intended project', () => {
  assert.match(bootstrap, /projectId/);
  assert.match(bootstrap, /fleboreport/);
  assert.match(bootstrap, /FLEBO_FIREBASE_CONFIG/);
  assert.match(bootstrap, /firebase-auth\.js/);
  assert.match(bootstrap, /firebase-firestore\.js/);
});

test('Firestore remains deny-by-default during preparation', () => {
  assert.match(rules, /allow read, write: if false/);
});

test('migration plan explicitly blocks production cutover without validation', () => {
  assert.match(plan, /Supabase remains the live/);
  assert.match(plan, /explicit approval/);
  assert.match(plan, /No production data/);
});
