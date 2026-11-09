# FleboReport Android production release

The production release is intentionally gated by GitHub Actions secrets. Never commit a keystore, passwords, Firebase service-account JSON, or Google Services configuration to the repository.

## Permanent Android signing key

Create a long-lived upload/release keystore owned and backed up by the project owner. Keep at least two offline backups. Losing this key can prevent updates from installing over the existing production app.

Required GitHub Actions secrets:

- `FLEBO_ANDROID_KEYSTORE_BASE64`: base64 of the release .jks/.keystore file.
- `FLEBO_ANDROID_KEYSTORE_PASSWORD`
- `FLEBO_ANDROID_KEY_ALIAS`
- `FLEBO_ANDROID_KEY_PASSWORD`
- `FLEBO_GOOGLE_SERVICES_JSON_BASE64`: base64 of Firebase Android `google-services.json`.

The Firebase Android app must be registered with package name exactly `com.fleboreport.app`. The JSON is client configuration, not a service-account private key. Never put a service-account key in the APK.

## Build

After all secrets are added in GitHub > Settings > Secrets and variables > Actions, run the workflow `FleboReport Android Production Release` manually. It verifies package identity, builds release, signs with the permanent key, verifies the signature, and uploads the APK artifact.

## Native push notifications

The native Capacitor Push Notifications plugin is included in the release build. FCM delivery additionally requires:
1. Firebase Cloud Messaging enabled for the Firebase project.
2. A server-side FCM sender credential stored only in Supabase Edge Function secrets (never in the Android app).
3. A secure device-token registration endpoint and database policy linking each FCM token to the authenticated Supabase user and workspace.
4. A server-side sender that sends only to authorized recipients and preserves the existing in-app/Web Push channels.

The existing Supabase Web Push/VAPID implementation remains unchanged. Do not claim native FCM is operational until the token-registration path, server sender, and real-device background/terminated-app tests pass.

## Backend contract

Use Firebase HTTP v1 with OAuth2 service-account credentials on the server. Do not use the legacy FCM server key, do not expose service-role or service-account secrets to the client, and do not send patient names, ID numbers, addresses, or clinical details in notification payloads. Use opaque event identifiers and fetch authorized details after the user opens the app.
