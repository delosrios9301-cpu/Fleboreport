package com.fleboreport.app;

import android.app.Activity;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.ClipData;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
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
    private static final String UPDATE_PREFS = "flebo_verified_apk_updates";
    private static final String CLINICAL_CHANNEL = "flebo_clinical_updates_v1";
    private static final int NOTIFICATION_REQUEST = 824;

    /** Solamente lee el estado: no se concede ningún permiso automáticamente. */
    @PluginMethod
    public void getSystemNotificationStatus(PluginCall call) {
        JSObject response = new JSObject();
        boolean allowed = notificationPermissionGranted();
        response.put("enabled", allowed);
        response.put("requiresPermission", Build.VERSION.SDK_INT >= 33);
        call.resolve(response);
    }

    private boolean notificationPermissionGranted() {
        boolean androidPermission = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (!androidPermission || !NotificationManagerCompat.from(getContext()).areNotificationsEnabled())
            return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = manager == null ? null
                : manager.getNotificationChannel(CLINICAL_CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE)
                return false;
        }
        return true;
    }

    /**
     * Abre el cuadro oficial de Android 13+ cuando el usuario activa los avisos.
     * El resultado se consulta después mediante getSystemNotificationStatus.
     */
    @PluginMethod
    public void requestSystemNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        }
        JSObject result = new JSObject();
        result.put("enabled", notificationPermissionGranted());
        result.put("requested", true);
        call.resolve(result);
    }

    /** Abre la configuración de notificaciones de FleboReport si fue denegada. */
    @PluginMethod
    public void openSystemNotificationSettings(PluginCall call) {
        try {
            Intent settings;
            if (Build.VERSION.SDK_INT >= 26) {
                settings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                settings.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                settings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                settings.setData(Uri.parse("package:" + getContext().getPackageName()));
            }
            getActivity().startActivity(settings);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudieron abrir los ajustes de notificaciones.");
        }
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CLINICAL_CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(
                CLINICAL_CHANNEL, "Avisos de FleboReport",
                NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Asignaciones, domicilios y alertas clínicas. Sin datos personales de pacientes.");
            manager.createNotificationChannel(channel);
        }
    }

    /** Avisos del sistema mientras la app está abierta; no sustituye FCM en segundo plano. */
    @PluginMethod
    public void showSystemNotification(PluginCall call) {
        if (!notificationPermissionGranted()) {
            call.reject("Autoriza las notificaciones de FleboReport en los ajustes de Android.");
            return;
        }
        String category = call.getString("category", "domicilios");
        String id = call.getString("eventId", "");
        if (!"domicilios".equals(category) && !"clinical-processing".equals(category)) {
            call.reject("Categoría de aviso no válida.");
            return;
        }
        if (id == null || id.isEmpty() || id.length() > 100 ||
            !id.matches("[A-Za-z0-9:_\\-]+")) {
            call.reject("Identificador de aviso no válido.");
            return;
        }
        String title = "clinical-processing".equals(category)
            ? "Nueva alerta clínica · FleboReport"
            : "Nueva notificación de domicilio · FleboReport";
        // No incluir nombres, cédulas, direcciones ni diagnósticos en pantalla bloqueada.
        String message = "Abre FleboReport para revisar el aviso con tu sesión autorizada.";
        try {
            ensureNotificationChannel();
            Intent intent = getContext().getPackageManager()
                .getLaunchIntentForPackage(getContext().getPackageName());
            if (intent == null) throw new IllegalStateException("No se pudo abrir la aplicación.");
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("flebo_notification_view", category);
            int requestId = (category + ":" + id).hashCode() & 0x7fffffff;
            PendingIntent open = PendingIntent.getActivity(getContext(),
                requestId, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new NotificationCompat.Builder(getContext(), CLINICAL_CHANNEL)
                .setSmallIcon(com.fleboreport.app.R.drawable.ic_stat_fleboreport)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setContentIntent(open)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .build();
            NotificationManagerCompat.from(getContext())
                .notify("flebo:" + category + ":" + id, 1, notification);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo mostrar la notificación Android: " + e.getMessage());
        }
    }

    /** Programación privada de alertas de domicilio, sin datos identificatorios. */
    @PluginMethod
    public void syncHomeVisitReminders(PluginCall call) {
        try {
            com.getcapacitor.JSArray visits = call.getArray("visits");
            if (visits == null) { call.reject("Falta la lista de recordatorios."); return; }
            int count = FleboHomeVisitReminderReceiver.replace(getContext(), visits);
            JSObject response = new JSObject();
            response.put("scheduled", count);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("No se pudieron programar las alertas: " + error.getMessage());
        }
    }

    /** Evita que las alertas locales de un usuario continúen tras cerrar sesión. */
    @PluginMethod
    public void clearHomeVisitReminders(PluginCall call) {
        FleboHomeVisitReminderReceiver.clear(getContext());
        call.resolve();
    }

    /** Solo se devuelve la vista solicitada, nunca datos clínicos del Intent. */
    @PluginMethod
    public void consumeSystemNotificationTarget(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String view = intent == null ? null : intent.getStringExtra("flebo_notification_view");
        JSObject response = new JSObject();
        response.put("view", "domicilios".equals(view) || "clinical-processing".equals(view) ? view : "");
        if (intent != null) intent.removeExtra("flebo_notification_view");
        call.resolve(response);
    }



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
    /** Comprueba el permiso por fuente sin abrir ajustes ni alterar el dispositivo. */
    @PluginMethod
    public void getInstallPermissionStatus(PluginCall call) {
        JSObject response = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < 26
            || getContext().getPackageManager().canRequestPackageInstalls();
        response.put("allowed", allowed);
        response.put("requiresPermission", Build.VERSION.SDK_INT >= 26);
        call.resolve(response);
    }

    @PluginMethod
    public void prepareUpdate(PluginCall call) {
        String version = call.getString("versionName", "");
        String assetUrl = call.getString("apkUrl", "");
        String sha256 = call.getString("sha256", "");
        if (!version.matches("[0-9]+\\.[0-9]+(\\.[0-9]+)?")) {
            call.reject("Versión de actualización inválida.");
            return;
        }
        // Los APK oficiales recientes se llaman TALCSYS-Lab-X.apk; los anteriores,
        // FleboReport-X.apk. Solo se aceptan estos dos nombres de la misma versión.
        String releasePath = "https://github.com/delosrios9301-cpu/Fleboreport/releases/download/"
            + "android-v" + version + "/";
        boolean authorizedAsset = assetUrl.equals(releasePath + "FleboReport-" + version + ".apk")
            || assetUrl.equals(releasePath + "TALCSYS-Lab-" + version + ".apk");
        if (!authorizedAsset || (!sha256.isEmpty() && !sha256.matches("[a-fA-F0-9]{64}"))) {
            call.reject("El archivo de actualización no es una publicación autorizada.");
            return;
        }
        if (!downloadingUpdate.compareAndSet(false, true)) {
            call.reject("La descarga de una actualización ya está en curso.");
            return;
        }
        updatesExecutor.execute(() -> {
            File target = null;
            try {
                target = new File(updateDirectory(), "FleboReport-" + version + ".apk");
                if (!target.isFile() || !digestMatches(target, sha256)) {
                    downloadApk(assetUrl, target, sha256);
                }
                validateApk(target, version);
                preparedVersion = version;
                // Si Android destruye la Activity al regresar de Ajustes, mantener
                // la referencia al archivo verificado (solo version y hash; no datos clínicos).
                getContext().getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
                    .edit().putString("version", version).putString("sha256", sha256).apply();
                JSObject out = new JSObject();
                out.put("ready", true);
                out.put("versionName", version);
                out.put("sizeBytes", target.length());
                call.resolve(out);
            } catch (Exception failure) {
                preparedVersion = "";
                getContext().getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
                    .edit().remove("version").remove("sha256").apply();
                // Si la firma, el APK o la descarga son inválidos, no conservar el archivo.
                if (target != null && target.exists()) target.delete();
                call.reject("No se pudo preparar la actualización: " + failure.getMessage());
            } finally {
                downloadingUpdate.set(false);
            }
        });
    }

    /**
     * Abre el instalador oficial de Android con una URI temporal de FileProvider.
     * No instala silenciosamente: el usuario siempre confirma en Android.
     * Puede reanudar tras volver de Ajustes sin volver a descargar el APK.
     */
    @PluginMethod
    public void installPreparedUpdate(PluginCall call) {
        String version = call.getString("versionName", "");
        if (!version.matches("[0-9]+\\.[0-9]+(\\.[0-9]+)?")) {
            call.reject("Versión de instalación inválida.");
            return;
        }
        String verifiedVersion = getContext()
            .getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
            .getString("version", "");
        if (!version.equals(preparedVersion) && !version.equals(verifiedVersion)) {
            call.reject("Primero descarga y verifica la actualización.");
            return;
        }
        try {
            File file = new File(updateDirectory(), "FleboReport-" + version + ".apk");
            String sha = getContext()
                .getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
                .getString("sha256", "");
            if (!sha.isEmpty() && !digestMatches(file, sha))
                throw new SecurityException("El archivo descargado no coincide con el SHA-256 publicado.");
            validateApk(file, version);

            if (Build.VERSION.SDK_INT >= 26
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(settings);
                        JSObject status = new JSObject();
                        status.put("permissionRequired", true);
                        call.resolve(status);
                    } catch (Exception failure) {
                        call.reject("No se pudieron abrir los ajustes de instalación: "
                            + failure.getMessage());
                    }
                });
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".talcsys.privateprovider", file);
            // ACTION_INSTALL_PACKAGE entrega el APK directamente al instalador oficial.
            // ClipData y FLAG_GRANT_READ_URI_PERMISSION permiten que este lea el
            // archivo privado en Android modernos sin copiarlo a Descargas.
            Intent installer = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            installer.setData(apkUri);
            installer.setClipData(ClipData.newRawUri("FleboReport APK", apkUri));
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(installer);
                    JSObject response = new JSObject();
                    response.put("installerOpened", true);
                    call.resolve(response);
                } catch (Exception failure) {
                    call.reject("Android no pudo abrir el instalador del paquete: "
                        + failure.getMessage());
                }
            });
        } catch (Exception failure) {
            call.reject("No se pudo abrir el instalador seguro: " + failure.getMessage());
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
