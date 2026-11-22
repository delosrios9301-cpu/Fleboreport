#!/usr/bin/env bash
# Seleccionar una firma existente, nunca crear otra.
set -euo pipefail
mkdir -p "$RUNNER_TEMP/previous"
gh release download android-v2.5 --repo "$GITHUB_REPOSITORY" --pattern 'FleboReport-2.5.apk' --dir "$RUNNER_TEMP/previous"
APKSIGNER="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner"
EXPECTED="$("$APKSIGNER" verify --print-certs "$RUNNER_TEMP/previous/FleboReport-2.5.apk" | sed -nE 's/.*certificate SHA-256 digest: ([[:xdigit:]]{64}).*/\1/p' | head -1 | tr 'A-F' 'a-f')"
if [[ ! "$EXPECTED" =~ ^[0-9a-f]{64}$ ]]; then
  echo "::error::No se pudo verificar el certificado de Android 2.5."
  exit 1
fi
echo "ORIGINAL_CERT_SHA256=$EXPECTED" >> "$GITHUB_ENV"
use_original_key() {
  local KEYFILE="$1" PASSWORD="$2" ALIAS="$3" KEY_PASSWORD="$4" ACTUAL
  [[ -s "$KEYFILE" && -n "$PASSWORD" && -n "$ALIAS" && -n "$KEY_PASSWORD" ]] || return 1
  ACTUAL="$(keytool -list -v -keystore "$KEYFILE" -storepass "$PASSWORD" -alias "$ALIAS" 2>/dev/null | sed -n 's/.*SHA256:[[:space:]]*//p' | head -1 | tr -d ':\r' | tr 'A-F' 'a-f')" || true
  [[ "$ACTUAL" == "$EXPECTED" ]] || return 1
  echo "::add-mask::$PASSWORD"
  echo "::add-mask::$KEY_PASSWORD"
  {
    echo "TALCSYS_KEYSTORE=$KEYFILE"
    echo "STORE_PASS=$PASSWORD"
    echo "KEY_ALIAS=$ALIAS"
    echo "KEY_PASS=$KEY_PASSWORD"
  } >> "$GITHUB_ENV"
  echo "disponible=true" >> "$GITHUB_OUTPUT"
  echo "Firma original verificada frente al certificado de Android 2.5."
  return 0
}
if [[ -n "$BACKUP_PASSWORD" && -s native/android/signing/fleboreport-release.jks.enc ]]; then
  if printf '%s' "$BACKUP_PASSWORD" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in native/android/signing/fleboreport-release.jks.enc -out "$RUNNER_TEMP/talcsys-original-backup.jks" -pass stdin; then
    DERIVED_PASSWORD="$(printf '%s' "$BACKUP_PASSWORD" | openssl dgst -sha256 -binary | xxd -p -c 256)"
    if use_original_key "$RUNNER_TEMP/talcsys-original-backup.jks" "$DERIVED_PASSWORD" fleboreport "$DERIVED_PASSWORD"; then exit 0; fi
  fi
fi
if [[ -n "$FLEBO_KEYSTORE" && -n "$FLEBO_STORE_PASS" && -n "$FLEBO_ALIAS" && -n "$FLEBO_KEY_PASS" ]]; then
  if printf '%s' "$FLEBO_KEYSTORE" | base64 --decode > "$RUNNER_TEMP/talcsys-flebo-original.jks"; then
    if use_original_key "$RUNNER_TEMP/talcsys-flebo-original.jks" "$FLEBO_STORE_PASS" "$FLEBO_ALIAS" "$FLEBO_KEY_PASS"; then exit 0; fi
  fi
fi
if [[ -n "$LEGACY_KEYSTORE" && -n "$LEGACY_STORE_PASS" && -n "$LEGACY_ALIAS" && -n "$LEGACY_KEY_PASS" ]]; then
  if printf '%s' "$LEGACY_KEYSTORE" | base64 --decode > "$RUNNER_TEMP/talcsys-legacy-original.jks"; then
    if use_original_key "$RUNNER_TEMP/talcsys-legacy-original.jks" "$LEGACY_STORE_PASS" "$LEGACY_ALIAS" "$LEGACY_KEY_PASS"; then exit 0; fi
  fi
fi
echo "::error::No se dispone de firma original compatible con Android 2.5. No publicar APK incompatible."
exit 1
