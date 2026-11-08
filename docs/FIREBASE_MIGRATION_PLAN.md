# FleboReport — Firebase migration preparation

## Safety boundary

- This work is isolated on branch `firebase-migration-prep`; `main` and GitHub Pages are not changed.
- Supabase remains the live authentication, database, realtime, Edge Functions, and private file-storage provider.
- No production data has been exported, copied, modified, or deleted.
- No Firebase rules or indexes have been deployed from this branch.
- Keep the Firebase project on Spark. Do not enable Blaze, billing, paid products, or paid external services.
- The initial Firestore rules intentionally deny every client read and write.

## Verified source findings

- The current browser app still loads `supabase-auth.js`, `cloud-state-sync.js`, `patient-cloud-sync.js`, `clinical-cloud-sync.js`, and `domicilios.js`.
- `supabase-auth.js` contains the Supabase project URL and publishable key and initializes the Supabase JS SDK.
- `cloud-state-sync.js` synchronizes workspace/user-scoped application state through Supabase.
- Patient synchronization uses Supabase table/RPC operations.
- Clinical and home-visit modules contain Supabase-backed queries, realtime channels, and workflow operations.
- The initial schema migration defines core entities including workspaces, profiles, memberships, patients, journeys, attentions, services, reports, inventory, clinical studies/samples/storage, and audit logs.
- Additional Supabase migrations define home visits, granular permissions, configuration/security, sync outbox/change log, and other operational behavior.
- The repository's current test command is `npm test` (Node's built-in test runner).
- No existing `firebase.json` or `firestore.rules` was present on `main` at inspection time.

## Migration workstreams

1. **Inventory and data contract**
   - Extract every deployed Supabase migration in order.
   - Build a definitive table, column, foreign-key, trigger, RPC, RLS, Storage bucket, and Edge Function inventory.
   - Do not rely on an estimated table count or a manually reconstructed list.
2. **Identity**
   - Map existing username-based accounts to Firebase Authentication UIDs.
   - Verify password-hash compatibility before choosing import vs. forced password reset.
   - Preserve persistent sessions and explicit logout behavior.
   - Never ship admin SDK credentials or service-account keys to the browser.
3. **Firestore model**
   - Preserve source primary keys as stable document IDs where safe.
   - Include workspace and user scope in every protected record.
   - Model event histories as append-only collections.
   - Split large state payloads to respect Firestore document limits.
   - Design transactional writes and conflict-safe revisions for cross-device synchronization.
4. **Authorization**
   - Translate RLS and application permission checks into tested Firestore rules.
   - Enforce workspace isolation, role permissions, site restrictions, and home-visit assignment visibility.
   - Keep deny-by-default rules until the full test matrix passes.
5. **Files and notifications**
   - Inventory private Storage objects and retention requirements.
   - Do not remove Supabase Storage until an approved, tested, free-compatible replacement exists.
   - Separate in-app notifications from background push delivery; identify a secure sender that does not require paid compute.
6. **Migration tooling**
   - Build local-only export, transform, import, count reconciliation, referential-integrity checks, and rollback reports.
   - Use least-privilege credentials, never commit secrets, and exclude exports containing patient data from Git.
   - Make imports idempotent and resumable.
7. **Verification and cutover**
   - Run tests in an isolated Firebase test project/database first.
   - Compare per-table counts, IDs, relationships, event histories, and file manifests.
   - Test all modules on phone, tablet, and desktop.
   - Run a parallel-read period before any write cutover.
   - Require a verified restorable backup and explicit approval before production cutover.
   - Keep Supabase intact and available for rollback until acceptance is complete.

## Required acceptance gates

- Authentication and session persistence pass.
- Cross-workspace and cross-user access tests deny unauthorized reads/writes.
- Role, site, and assignment permissions match current behavior.
- Patients, journeys, attentions, clinical studies, samples, processing events, home visits, inventory, reports, billing, audit, and configuration reconcile exactly.
- No duplicate seed data or disappearing records after reload.
- Offline/online transitions and multi-device synchronization pass.
- Firestore reads/writes, storage, and egress remain within verified free quotas under measured workload.
- No paid plan or billing account is activated.
- Production deployment and Supabase shutdown remain separate, explicit approval steps.

## Current status

Preparation scaffold only. Firebase is not yet wired into the running application; no data has been migrated; no deployment or production cutover has occurred.
