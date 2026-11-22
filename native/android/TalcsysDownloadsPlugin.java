package com.fleboreport.app;

import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.ClipData;
import android.net.Uri;
import androidx.core.content.FileProvider;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.IOException;

/** Guarda PDF/PNG de Jornada en Descargas con confirmación real de Android.
 * No necesita permiso de almacenamiento en Android 10+.
 */
@CapacitorPlugin(name = "TalcsysDownloads")
public class TalcsysDownloadsPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mime");
        String encoded = call.getString("base64");
        if (filename == null || mime == null || encoded == null
                || !filename.matches("[A-Za-z0-9._-]{1,160}")
                || !(mime.equals("application/pdf") || mime.equals("image/png"))
                || !(filename.endsWith(".pdf") || filename.endsWith(".png"))) {
            call.reject("Nombre, tipo o contenido inválido");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length < 100 || bytes.length > 40 * 1024 * 1024) {
                call.reject("El archivo está vacío o supera 40 MB");
                return;
            }
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TALCSYS Lab");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Android no pudo crear el archivo");
                try {
                    try (OutputStream stream = resolver.openOutputStream(uri)) {
                        if (stream == null) throw new Exception("Android no abrió el archivo");
                        stream.write(bytes);
                        stream.flush();
                    }
                    ContentValues ready = new ContentValues();
                    ready.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(uri, ready, null, null);
                } catch (Exception ex) {
                    resolver.delete(uri, null, null);
                    throw ex;
                }
            } else {
                // Android 9 y anteriores requieren flujo SAF; no afirmar descarga.
                call.reject("Android antiguo: usa el selector de archivos del sistema");
                return;
            }
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("filename", filename);
            result.put("uri", uri.toString());
            result.put("location", "Descargas/TALCSYS Lab");
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("No se pudo guardar en Descargas: " + ex.getMessage());
        }
    }
    /** Envía el archivo real al selector nativo. Solo se concede lectura al destino elegido. */
    @PluginMethod
    public void share(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mime");
        String encoded = call.getString("base64");
        if (filename == null || mime == null || encoded == null
                || !filename.matches("[A-Za-z0-9._-]{1,160}")
                || !(mime.equals("application/pdf") || mime.equals("image/png"))
                || !(filename.endsWith(".pdf") || filename.endsWith(".png"))) {
            call.reject("Nombre, tipo o contenido del reporte inválido");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length < 100 || bytes.length > 40 * 1024 * 1024) {
                call.reject("El reporte está vacío o supera 40 MB");
                return;
            }
            File directory = new File(getContext().getCacheDir(), "talcsys-reports");
            if (!directory.exists() && !directory.mkdirs())
                throw new IOException("No se pudo crear la carpeta temporal");
            // Borrar solamente archivos temporales expirados, nunca datos clínicos.
            File[] previous = directory.listFiles();
            if (previous != null) {
                long expiration = System.currentTimeMillis() - 86400000L;
                for (File previousFile : previous)
                    if (previousFile.isFile() && previousFile.lastModified() < expiration)
                        previousFile.delete();
            }
            File output = new File(directory, System.currentTimeMillis() + "-" + filename);
            try (FileOutputStream stream = new FileOutputStream(output)) {
                stream.write(bytes);
                stream.flush();
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".idscanner.provider", output);
            // Android / WhatsApp necesitan recibir tanto EXTRA_STREAM como ClipData,
            // con permiso URI de lectura propagado también al selector nativo.
            ClipData attachment = ClipData.newUri(
                getContext().getContentResolver(), filename, uri);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.setClipData(attachment);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(intent, "Compartir reporte de jornada");
            chooser.setClipData(attachment);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
            JSObject result = new JSObject();
            // Solo confirma que se abrió el selector; no que el destinatario recibió.
            result.put("chooserOpened", true);
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("No se pudo abrir Compartir: " + ex.getMessage());
        }
    }

}
