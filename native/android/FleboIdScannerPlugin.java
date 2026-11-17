package com.fleboreport.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;

@CapacitorPlugin(name = "FleboIdScanner", permissions = {
    @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
})
public class FleboIdScannerPlugin extends Plugin {
    private File pendingPhoto;

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject response = new JSObject();
            response.put("versionCode", androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(info));
            response.put("versionName", info.versionName);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("No se pudo consultar la versión instalada.");
        }
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        launchCamera(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void onCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            launchCamera(call);
        } else {
            call.reject("Permiso de cámara denegado.");
        }
    }

    private void launchCamera(PluginCall call) {
        try {
            File directory = new File(getContext().getCacheDir(), "id-scan");
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("No se pudo crear caché temporal.");
                return;
            }
            pendingPhoto = File.createTempFile("cedula-", ".jpg", directory);
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".idscanner.provider", pendingPhoto);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "onPhotoTaken");
        } catch (Exception e) {
            cleanup();
            call.reject("No se pudo abrir la cámara: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void onPhotoTaken(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || pendingPhoto == null) {
            cleanup();
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        File photo = pendingPhoto;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(photo.getAbsolutePath(), bounds);
            int sample = 1;
            while (bounds.outWidth / sample > 2400 || bounds.outHeight / sample > 2400) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            Bitmap bitmap = BitmapFactory.decodeFile(photo.getAbsolutePath(), options);
            if (bitmap == null) throw new IOException("Fotografía ilegible.");
            int rotation = 0;
            try {
                ExifInterface exif = new ExifInterface(photo.getAbsolutePath());
                switch (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    case ExifInterface.ORIENTATION_ROTATE_90: rotation = 90; break;
                    case ExifInterface.ORIENTATION_ROTATE_180: rotation = 180; break;
                    case ExifInterface.ORIENTATION_ROTATE_270: rotation = 270; break;
                }
            } catch (IOException ignored) {}
            if (rotation != 0) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotation);
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (rotated != bitmap) bitmap.recycle();
                bitmap = rotated;
            }
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            final Bitmap finalBitmap = bitmap;
            // El archivo temporal se elimina antes de iniciar el OCR; ML Kit recibe únicamente memoria.
            cleanup();
            // Únicamente QR: ignorar PDF417 y otros códigos del reverso.
            BarcodeScannerOptions scanOptions = new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();
            BarcodeScanner scanner = BarcodeScanning.getClient(scanOptions);
            scanner.process(image)
                .addOnSuccessListener(barcodes -> {
                    String qr = null;
                    for (Barcode barcode : barcodes) {
                        if (barcode.getFormat() == Barcode.FORMAT_QR_CODE && barcode.getRawValue() != null) {
                            qr = barcode.getRawValue();
                            break;
                        }
                    }
                    if (qr == null || qr.trim().isEmpty()) {
                        call.reject("No se detectó un QR legible. Enfoca solo el QR del reverso y vuelve a tomar la foto.");
                    } else {
                        JSObject response = new JSObject();
                        response.put("qr", qr);
                        call.resolve(response);
                    }
                })
                .addOnFailureListener(e -> call.reject("No se pudo leer el QR: " + e.getMessage()))
                .addOnCompleteListener(task -> {
                    scanner.close();
                    finalBitmap.recycle();
                });
        } catch (Exception e) {
            cleanup();
            call.reject("No se pudo procesar la fotografía: " + e.getMessage());
        }
    }

    private void cleanup() {
        if (pendingPhoto != null) {
            if (pendingPhoto.exists()) pendingPhoto.delete();
            pendingPhoto = null;
        }
    }
}
