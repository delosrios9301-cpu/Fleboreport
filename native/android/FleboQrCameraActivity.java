package com.fleboreport.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Size;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Lector QR en vivo y sin fotos: analiza frames 1080p únicamente en el dispositivo. */
public class FleboQrCameraActivity extends AppCompatActivity {
    private static final int CAMERA_REQUEST = 803;
    private PreviewView previewView;
    private TextView status;
    private Button torchButton;
    private Camera camera;
    private ProcessCameraProvider provider;
    private BarcodeScanner detector;
    private ExecutorService analyzerExecutor;
    private final AtomicBoolean analyzing = new AtomicBoolean(false);
    private final AtomicBoolean finished = new AtomicBoolean(false);
    private boolean torchEnabled = false;
    private float lastTouchX = 0f;
    private float lastTouchY = 0f;
    private float pinchDistance = 0f;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        analyzerExecutor = Executors.newSingleThreadExecutor();
        detector = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAllPotentialBarcodes()
            .build());
        buildInterface();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        } else {
            startCamera();
        }
    }

    private void buildInterface() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);

        TextView heading = new TextView(this);
        heading.setText("Escanear QR de cédula");
        heading.setTextColor(Color.WHITE);
        heading.setTextSize(20);
        heading.setGravity(Gravity.CENTER);
        heading.setPadding(12, 24, 12, 18);
        root.addView(heading, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(previewView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        previewView.setOnTouchListener((view, event) -> {
            if (camera == null) return true;
            if (event.getPointerCount() >= 2) {
                float dx = event.getX(0) - event.getX(1);
                float dy = event.getY(0) - event.getY(1);
                float distance = (float) Math.hypot(dx, dy);
                if (pinchDistance > 0f) {
                    ZoomState zoom = camera.getCameraInfo().getZoomState().getValue();
                    if (zoom != null) {
                        float target = zoom.getZoomRatio() * (distance / pinchDistance);
                        camera.getCameraControl().setZoomRatio(Math.max(zoom.getMinZoomRatio(),
                            Math.min(zoom.getMaxZoomRatio(), target)));
                    }
                }
                pinchDistance = distance;
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                pinchDistance = 0f;
                lastTouchX = event.getX();
                lastTouchY = event.getY();
                MeteringPoint point = previewView.getMeteringPointFactory()
                    .createPoint(lastTouchX, lastTouchY);
                camera.getCameraControl().startFocusAndMetering(
                    new FocusMeteringAction.Builder(point)
                        .setAutoCancelDuration(3, TimeUnit.SECONDS).build());
            }
            return true;
        });

        status = new TextView(this);
        status.setText("Centra el QR cuadrado. Toca para enfocar o separa dos dedos para ampliar.");
        status.setTextColor(Color.WHITE);
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(16, 14, 16, 14);
        root.addView(status, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        actions.setPadding(12, 0, 12, 18);
        torchButton = new Button(this);
        torchButton.setText("Linterna");
        torchButton.setEnabled(false);
        torchButton.setOnClickListener(view -> {
            if (camera != null && camera.getCameraInfo().hasFlashUnit()) {
                torchEnabled = !torchEnabled;
                camera.getCameraControl().enableTorch(torchEnabled);
                torchButton.setText(torchEnabled ? "Apagar linterna" : "Linterna");
            }
        });
        actions.addView(torchButton, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button close = new Button(this);
        close.setText("Cancelar");
        close.setOnClickListener(view -> finish());
        actions.addView(close, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(actions);
        setContentView(root);
    }

    private void startCamera() {
        final ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (isFinishing() || isDestroyed()) return;
            try {
                provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                // Los QR densos requieren suficientes píxeles: evitar el modo 640x480.
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setTargetResolution(new Size(1920, 1080))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(analyzerExecutor, this::analyze);
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                    preview, analysis);
                torchButton.setEnabled(camera.getCameraInfo().hasFlashUnit());
            } catch (Exception exception) {
                status.setText("No se pudo iniciar la cámara de alta resolución. Cancela y reintenta.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @androidx.camera.core.ExperimentalGetImage
    private void analyze(@NonNull ImageProxy frame) {
        if (finished.get() || !analyzing.compareAndSet(false, true)) {
            frame.close();
            return;
        }
        android.media.Image media = frame.getImage();
        if (media == null) {
            analyzing.set(false);
            frame.close();
            return;
        }
        InputImage input = InputImage.fromMediaImage(media,
            frame.getImageInfo().getRotationDegrees());
        detector.process(input)
            .addOnSuccessListener(barcodes -> {
                if (finished.get()) return;
                for (Barcode barcode : barcodes) {
                    String value = barcode.getRawValue();
                    if (barcode.getFormat() == Barcode.FORMAT_QR_CODE
                        && value != null && !value.trim().isEmpty() && value.length() <= 16384
                        && finished.compareAndSet(false, true)) {
                        Intent result = new Intent();
                        result.putExtra("qr", value);
                        result.putExtra("format", "QR_CODE");
                        setResult(Activity.RESULT_OK, result);
                        finish();
                        break;
                    }
                }
            })
            .addOnCompleteListener(task -> {
                analyzing.set(false);
                frame.close();
            });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
        @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Intent error = new Intent();
                error.putExtra("error", "FleboReport necesita permiso de cámara para leer el QR.");
                setResult(Activity.RESULT_CANCELED, error);
                finish();
            }
        }
    }

    @Override
    protected void onDestroy() {
        finished.set(true);
        if (provider != null) provider.unbindAll();
        if (detector != null) detector.close();
        if (analyzerExecutor != null) analyzerExecutor.shutdown();
        super.onDestroy();
    }
}
