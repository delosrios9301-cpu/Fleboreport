import { CapacitorUpdater } from '@capgo/capacitor-updater';

const MANIFEST_URL = 'https://delosrios9301-cpu.github.io/Fleboreport/updates/latest.json';
const ALLOWED_HOST = 'delosrios9301-cpu.github.io';
const ALLOWED_PATH_PREFIX = '/Fleboreport/updates/';

let updateInProgress = false;
let lastCheckAt = 0;
async function startFleboLiveUpdates() {
  if (updateInProgress || Date.now() - lastCheckAt < 30000) return;
  updateInProgress = true;
  lastCheckAt = Date.now();
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) { updateInProgress = false; return; }

  // Must be acknowledged immediately on every launch to preserve rollback.
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    console.warn('[FleboReport OTA] No se pudo confirmar el bundle activo:', error);
    updateInProgress = false;
    return;
  }

  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = await response.json();

    if (
      typeof manifest.version !== 'string' ||
      !/^[a-f0-9]{40}$/i.test(manifest.version) ||
      typeof manifest.url !== 'string' ||
      typeof manifest.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(manifest.checksum)
    ) throw new Error('Manifest OTA inválido.');

    const bundleUrl = new URL(manifest.url);
    if (
      bundleUrl.protocol !== 'https:' ||
      bundleUrl.hostname !== ALLOWED_HOST ||
      !bundleUrl.pathname.startsWith(ALLOWED_PATH_PREFIX)
    ) throw new Error('URL de paquete OTA no autorizada.');

    const active = await CapacitorUpdater.current();
    if (active?.bundle?.version === manifest.version) return;

    console.info('[FleboReport OTA] Descargando versión', manifest.version);
    const downloaded = await CapacitorUpdater.download({
      url: bundleUrl.href,
      version: manifest.version,
      checksum: manifest.checksum
    });
    await CapacitorUpdater.set({ id: downloaded.id });
  } catch (error) {
    // An OTA/network failure must never prevent the installed app from opening.
    console.warn('[FleboReport OTA] Se conserva la versión actual:', error);
  } finally {
    updateInProgress = false;
  }
}

void startFleboLiveUpdates();
// Reintentar al recuperar conexión o volver a primer plano; sin bucles de descarga.
window.addEventListener('online', () => void startFleboLiveUpdates());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void startFleboLiveUpdates();
});
