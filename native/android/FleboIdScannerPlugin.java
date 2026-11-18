package com.fleboreport.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
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
}
