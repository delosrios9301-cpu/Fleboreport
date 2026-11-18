package com.fleboreport.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Escanea QR de cédula mediante CameraX/ML Kit local. No almacena fotos ni QR. */
@CapacitorPlugin(name = "FleboIdScanner")
public class FleboIdScannerPlugin extends Plugin {
    private boolean scanning = false;
    private final AtomicBoolean downloadingUpdate = new AtomicBoolean(false);
    private final ExecutorService updatesExecutor = Executors.newSingleThreadExecutor();
    private static final long MAX_APK_BYTES = 125L * 1024L * 1024L;
    private volatile String preparedVersion = "";


    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            JSObject response = new JSObject();
            response.put("versionCode",
                androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(info));
            response.put("versionName", info.versionName);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("No se pudo consultar la versión instalada.");
        }
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (scanning) {
            call.reject("Ya existe un escaneo en curso.");
            return;
        }
        scanning = true;
        try {
            Intent intent = new Intent(getActivity(), FleboQrCameraActivity.class);
            startActivityForResult(call, intent, "onScanResult");
        } catch (Exception error) {
            scanning = false;
            call.reject("No se pudo abrir el lector de cédulas. Reintenta desde Jornada.");
        }
    }

    @ActivityCallback
    private void onScanResult(PluginCall call, ActivityResult result) {
        scanning = false;
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK) {
            String error = data == null ? null : data.getStringExtra("error");
            if (error != null && !error.isEmpty()) {
                call.reject(error);
            } else {
                JSObject cancelled = new JSObject();
                cancelled.put("cancelled", true);
                call.resolve(cancelled);
            }
            return;
        }

        String value = data == null ? null : data.getStringExtra("qr");
        if (value == null || value.trim().isEmpty()) {
            call.reject("La cámara terminó sin recuperar un código QR.");
            return;
        }
        // Solo se transmite al formulario web de la app, nunca a un servidor o log.
        JSObject response = new JSObject();
        response.put("qr", value);
        response.put("format", "QR_CODE");
        call.resolve(response);
    }
    /**
     * Descarga la APK publicada en GitHub Releases dentro del caché privado.
     * Comprueba packageId, versión superior y firma instalada antes de ofrecer la instalación.
     * Nunca se descargan archivos clínicos, ni se modifica la base de datos.
     */
    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String version = call.getString("versionName", "");
        String assetUrl = call.getString("apkUrl", "");
        String sha256 = call.getString("sha256", "");
        if (!version.matches("[0-9]+\\.[0-9]+(\\.[0-9]+)?")) {
            call.reject("Versión de actualización inválida.");
            return;
        }
        String expected = "https://github.com/delosrios9301-cpu/Fleboreport/releases/download/"
            + "android-v" + version + "/FleboReport-" + version + ".apk";
        if (!expected.equals(assetUrl) || (!sha256.isEmpty() && !sha256.matches("[a-fA-F0-9]{64}"))) {
            call.reject("El archivo de actualización no es una publicación autorizada.");
            return;
        }
        if (!downloadingUpdate.compareAndSet(false, true)) {
            call.reject("La descarga de una actualización ya está en curso.");
            return;
        }
        updatesExecutor.execute(() -> {
            File target = new File(updateDirectory(), "FleboReport-" + version + ".apk");
            try {
                if (!target.isFile() || !digestMatches(target, sha256)) {
                    downloadApk(assetUrl, target, sha256);
                }
                validateApk(target, version);
                preparedVersion = version;
                JSObject out = new JSObject();
                out.put("ready", true);
                out.put("versionName", version);
                out.put("sizeBytes", target.length());
                call.resolve(out);
            } catch (Exception failure) {
                preparedVersion = "";
                // Si la firma, el APK o la descarga son inválidos, no conservar el archivo.
                if (target.exists()) target.delete();
                call.reject("No se pudo preparar la actualización: " + failure.getMessage());
            } finally {
                downloadingUpdate.set(false);
            }
        });
    }

    /** Solicita el instalador del sistema tras comprobar de nuevo la APK preparada. */
    @PluginMethod
    public void installPreparedUpdate(PluginCall call) {
        String version = call.getString("versionName", "");
        if (!version.equals(preparedVersion) ||
            !version.matches("[0-9]+\\.[0-9]+(\\.[0-9]+)?")) {
            call.reject("Primero debe descargarse y verificarse la actualización.");
            return;
        }
        File file = new File(updateDirectory(), "FleboReport-" + version + ".apk");
        try {
            validateApk(file, version);
            if (Build.VERSION.SDK_INT >= 26
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                call.reject("Autoriza instalar aplicaciones desde FleboReport y regresa "
                    + "a la aplicación para continuar.");
                return;
            }
            Uri apkUri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".idscanner.provider", file);
            Intent installer = new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(installer);
            call.resolve();
        } catch (Exception failure) {
            call.reject("No se pudo abrir el instalador: " + failure.getMessage());
        }
    }

    private File updateDirectory() {
        File directory = new File(getContext().getCacheDir(), "android-updates");
        if (!directory.isDirectory() && !directory.mkdirs())
            throw new IllegalStateException("No se pudo crear el caché de actualizaciones.");
        return directory;
    }

    private boolean digestMatches(File file, String expected) throws Exception {
        if (!file.isFile() || file.length() <= 0 || file.length() > MAX_APK_BYTES)
            return false;
        if (expected.isEmpty()) return true; // La firma y el paquete se verifican después.
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) != -1) md.update(buffer, 0, n);
        }
        byte[] actual = md.digest();
        StringBuilder sb = new StringBuilder();
        for (byte b : actual) sb.append(String.format("%02x", b & 0xff));
        return sb.toString().equalsIgnoreCase(expected);
    }

    private void downloadApk(String assetUrl, File target, String expectedSha) throws Exception {
        File temporary = new File(target.getParentFile(), target.getName() + ".partial");
        temporary.delete();
        target.delete();
        String currentUrl = assetUrl;
        HttpURLConnection response = null;
        try {
            for (int redirect = 0; redirect < 6; redirect++) {
                URL url = new URL(currentUrl);
                String host = url.getHost().toLowerCase(java.util.Locale.ROOT);
                if (!"https".equalsIgnoreCase(url.getProtocol())
                    || !(host.equals("github.com")
                      || host.equals("release-assets.githubusercontent.com")
                      || host.equals("objects.githubusercontent.com"))) {
                    throw new SecurityException("Redirección de descarga no autorizada.");
                }
                response = (HttpURLConnection) url.openConnection();
                response.setInstanceFollowRedirects(false);
                response.setConnectTimeout(15000);
                response.setReadTimeout(45000);
                response.setRequestProperty("Accept", "application/octet-stream");
                int status = response.getResponseCode();
                if (status == 301 || status == 302 || status == 303
                    || status == 307 || status == 308) {
                    String location = response.getHeaderField("Location");
                    if (location == null) throw new IllegalStateException("Redirección incompleta.");
                    currentUrl = new URL(url, location).toString();
                    response.disconnect();
                    response = null;
                    continue;
                }
                if (status != 200) throw new IllegalStateException("HTTP " + status);
                long declared = response.getContentLengthLong();
                if (declared > MAX_APK_BYTES)
                    throw new IllegalStateException("La actualización excede el tamaño permitido.");
                long total = 0;
                int lastProgress = -1;
                try (InputStream in = response.getInputStream();
                     FileOutputStream out = new FileOutputStream(temporary)) {
                    byte[] buffer = new byte[65536];
                    int n;
                    while ((n = in.read(buffer)) != -1) {
                        total += n;
                        if (total > MAX_APK_BYTES)
                            throw new IllegalStateException("El archivo excede 125 MB.");
                        out.write(buffer, 0, n);
                        if (declared > 0) {
                            int pct = Math.min(100, (int) (total * 100 / declared));
                            if (pct != lastProgress) {
                                lastProgress = pct;
                                JSObject event = new JSObject();
                                event.put("percentage", pct);
                                notifyListeners("updateProgress", event);
                            }
                        }
                    }
                }
                if (total <= 0 || (declared > 0 && total != declared))
                    throw new IllegalStateException("La descarga quedó incompleta.");
                if (!digestMatches(temporary, expectedSha))
                    throw new SecurityException("La integridad SHA-256 no coincide.");
                if (!temporary.renameTo(target))
                    throw new IllegalStateException("No se pudo completar la descarga.");
                return;
            }
            throw new SecurityException("Demasiadas redirecciones de descarga.");
        } finally {
            if (response != null) response.disconnect();
            temporary.delete();
        }
    }

    private void validateApk(File file, String version) throws Exception {
        if (!file.isFile() || file.length() <= 0 || file.length() > MAX_APK_BYTES)
            throw new IllegalStateException("Archivo APK ausente o inválido.");
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo current = pm.getPackageInfo(getContext().getPackageName(), flags);
        PackageInfo downloaded = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (downloaded == null ||
            !getContext().getPackageName().equals(downloaded.packageName))
            throw new SecurityException("El APK no corresponde a FleboReport.");
        if (!version.equals(downloaded.versionName) ||
            PackageInfoCompat.getLongVersionCode(downloaded)
              <= PackageInfoCompat.getLongVersionCode(current))
            throw new SecurityException("La versión no es superior a la instalada.");
        Signature[] currentSigners;
        Signature[] downloadedSigners;
        if (Build.VERSION.SDK_INT >= 28) {
            if (current.signingInfo == null || downloaded.signingInfo == null)
                throw new SecurityException("Falta información de firma Android.");
            currentSigners = current.signingInfo.getApkContentsSigners();
            downloadedSigners = downloaded.signingInfo.getApkContentsSigners();
        } else {
            currentSigners = current.signatures;
            downloadedSigners = downloaded.signatures;
        }
        if (currentSigners == null || downloadedSigners == null
            || currentSigners.length != 1 || downloadedSigners.length != 1
            || !Arrays.equals(currentSigners[0].toByteArray(),
                              downloadedSigners[0].toByteArray()))
            throw new SecurityException("Firma de actualización incompatible con la instalada.");
    }

    @Override
    protected void handleOnDestroy() {
        updatesExecutor.shutdown();
        super.handleOnDestroy();
    }

}
