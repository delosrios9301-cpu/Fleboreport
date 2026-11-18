package com.fleboreport.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/** QR en video continuo, sin fotografías: la cámara se cierra al reconocerlo. */
@CapacitorPlugin(name = "FleboIdScanner")
public class FleboIdScannerPlugin extends Plugin {
    private boolean scanning = false;

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo info = getContext().getPackageManager()
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
            call.reject("Ya hay un escaneo de QR en curso.");
            return;
        }
        scanning = true;
        try {
            GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
            scanner.startScan()
                .addOnSuccessListener(barcode -> {
                    scanning = false;
                    String qr = barcode != null ? barcode.getRawValue() : null;
                    if (barcode == null || barcode.getFormat() != Barcode.FORMAT_QR_CODE
                        || qr == null || qr.trim().isEmpty()) {
                        call.reject("No se detectó un QR válido de la cédula.");
                        return;
                    }
                    JSObject response = new JSObject();
                    response.put("qr", qr);
                    call.resolve(response);
                })
                .addOnCanceledListener(() -> {
                    scanning = false;
                    JSObject response = new JSObject();
                    response.put("cancelled", true);
                    call.resolve(response);
                })
                .addOnFailureListener(error -> {
                    scanning = false;
                    if (error instanceof MlKitException
                        && ((MlKitException) error).getErrorCode() == MlKitException.CODE_SCANNER_CANCELLED) {
                        JSObject response = new JSObject();
                        response.put("cancelled", true);
                        call.resolve(response);
                        return;
                    }
                    call.reject("No se pudo iniciar el lector QR. Comprueba que Servicios de Google Play esté actualizado y vuelve a intentar.");
                });
        } catch (Exception e) {
            scanning = false;
            call.reject("El lector QR no está disponible en este Android. Comprueba Servicios de Google Play.");
        }
    }
}
