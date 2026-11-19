package com.fleboreport.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
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
import com.google.mlkit.vision.barcode.ZoomSuggestionOptions;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.PlanarYUVLuminanceSource;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Lector de QR en vivo. ML Kit analiza todos los frames; ZXing reintenta sobre
 * luminancia original e invertida cada tres frames. Todo se procesa localmente,
 * sin guardar fotografías, vídeo, datos del QR ni registros de pacientes.
 */
public class FleboQrCameraActivity extends AppCompatActivity {
    private static final int CAMERA_REQUEST = 803;
    private PreviewView previewView;
    private TextView status;
    private Button torchButton;
    private Button zoomButton;
    private Camera camera;
    private ProcessCameraProvider provider;
    private BarcodeScanner detector;
    private ExecutorService analyzerExecutor;
    private final AtomicBoolean analyzing = new AtomicBoolean(false);
    private final AtomicBoolean finished = new AtomicBoolean(false);
    private long scanStartedAt;
    private int analyzedFrames = 0;
    private boolean torchEnabled = false;
    private float pinchDistance = 0f;
    private float nextZoom = 1.5f;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        analyzerExecutor = Executors.newSingleThreadExecutor();
        // ML Kit 17.3 ofrece ampliación automática al detectar un QR distante.
        ZoomSuggestionOptions zoomOptions = new ZoomSuggestionOptions.Builder(ratio -> {
            if (finished.get()) return false;
            runOnUiThread(() -> {
                if (camera != null && !finished.get()) setZoom(ratio);
            });
            return true;
        }).setMaxSupportedZoomRatio(4.0f).build();
        detector = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAllPotentialBarcodes()
            .setZoomSuggestionOptions(zoomOptions)
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
        heading.setText("Leer QR de la cédula");
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
                float distance = (float) Math.hypot(event.getX(0) - event.getX(1),
                    event.getY(0) - event.getY(1));
                if (pinchDistance > 0f) {
                    ZoomState zoom = camera.getCameraInfo().getZoomState().getValue();
                    if (zoom != null) setZoom(zoom.getZoomRatio() * distance / pinchDistance);
                }
                pinchDistance = distance;
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                pinchDistance = 0f;
                focusAt(event.getX(), event.getY());
            }
            return true;
        });

        status = new TextView(this);
        status.setText("Coloca el QR cuadrado dentro de la cámara. La lectura es automática.");
        status.setTextColor(Color.WHITE);
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(16, 14, 16, 14);
        root.addView(status, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        actions.setPadding(8, 0, 8, 18);
        torchButton = new Button(this);
        torchButton.setText("Linterna");
        torchButton.setEnabled(false);
        torchButton.setOnClickListener(view -> {
            if (camera != null && camera.getCameraInfo().hasFlashUnit()) {
                torchEnabled = !torchEnabled;
                camera.getCameraControl().enableTorch(torchEnabled);
                torchButton.setText(torchEnabled ? "Apagar luz" : "Linterna");
            }
        });
        actions.addView(torchButton, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        zoomButton = new Button(this);
        zoomButton.setText("Ampliar");
        zoomButton.setEnabled(false);
        zoomButton.setOnClickListener(view -> {
            if (camera == null) return;
            setZoom(nextZoom);
            nextZoom = nextZoom >= 3f ? 1f : nextZoom + 0.75f;
        });
        actions.addView(zoomButton, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button close = new Button(this);
        close.setText("Cancelar");
        close.setOnClickListener(view -> finish());
        actions.addView(close, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(actions);
        setContentView(root);
    }

    private void setZoom(float requested) {
        Camera active = camera;
        if (active == null || finished.get()) return;
        ZoomState zoom = active.getCameraInfo().getZoomState().getValue();
        if (zoom == null) return;
        float ratio = Math.max(zoom.getMinZoomRatio(), Math.min(zoom.getMaxZoomRatio(), requested));
        active.getCameraControl().setZoomRatio(ratio);
    }

    private void focusAt(float x, float y) {
        Camera active = camera;
        if (active == null || finished.get()) return;
        MeteringPoint point = previewView.getMeteringPointFactory().createPoint(x, y);
        active.getCameraControl().startFocusAndMetering(
            new FocusMeteringAction.Builder(point).setAutoCancelDuration(4, TimeUnit.SECONDS).build());
    }

    private void startCamera() {
        final ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (isFinishing() || isDestroyed()) return;
            try {
                provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                // Mantener detalle suficiente para QR densos como los del documento.
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setTargetResolution(new Size(1920, 1080))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(analyzerExecutor, this::analyze);
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                    preview, analysis);
                torchButton.setEnabled(camera.getCameraInfo().hasFlashUnit());
                zoomButton.setEnabled(true);
                scanStartedAt = SystemClock.elapsedRealtime();
                // El AF continuo no siempre fija el QR cercano al abrir: enfocar el centro.
                previewView.postDelayed(() -> {
                    if (!finished.get() && camera != null)
                        focusAt(previewView.getWidth() / 2f, previewView.getHeight() / 2f);
                }, 650L);
            } catch (Exception exception) {
                status.setText("No se pudo iniciar la cámara. Cierra el lector y reintenta.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void qrDetected(String value) {
        if (value == null || value.trim().isEmpty() || value.length() > 16384
            || !finished.compareAndSet(false, true)) return;
        runOnUiThread(() -> {
            Intent result = new Intent();
            result.putExtra("qr", value);
            result.putExtra("format", "QR_CODE");
            setResult(Activity.RESULT_OK, result);
            finish();
        });
    }

    /**
     * Segundo motor: lee la señal Y del frame de CameraX sin crear JPEGs.
     * Se usa cada tres frames para evitar bloquear la vista de cámara.
     */
    private String decodeWithZxing(@NonNull ImageProxy frame) {
        try {
            ImageProxy.PlaneProxy plane = frame.getPlanes()[0];
            int width = frame.getWidth(), height = frame.getHeight();
            int stride = plane.getRowStride(), pixelStride = plane.getPixelStride();
            ByteBuffer pixels = plane.getBuffer().duplicate();
            int start = pixels.position();
            byte[] luminance = new byte[width * height];
            if (pixelStride == 1 && stride == width) {
                pixels.get(luminance, 0, luminance.length);
            } else {
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        luminance[y * width + x] = pixels.get(start + y * stride + x * pixelStride);
                    }
                }
            }
            PlanarYUVLuminanceSource image = new PlanarYUVLuminanceSource(
                luminance, width, height, 0, 0, width, height, false);
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, Arrays.asList(BarcodeFormat.QR_CODE));
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            MultiFormatReader reader = new MultiFormatReader();
            reader.setHints(hints);
            for (int inverted = 0; inverted < 2; inverted++) {
                try {
                    BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(
                        inverted == 0 ? image : image.invert()));
                    Result found = reader.decodeWithState(bitmap);
                    if (found != null && found.getBarcodeFormat() == BarcodeFormat.QR_CODE)
                        return found.getText();
                } catch (com.google.zxing.ReaderException ignored) {
                    reader.reset();
                }
            }
        } catch (Exception ignored) {
            // Un frame no interpretable jamás debe impedir el siguiente frame.
        }
        return null;
    }

    @androidx.camera.core.ExperimentalGetImage
    private void analyze(@NonNull ImageProxy frame) {
        if (finished.get() || !analyzing.compareAndSet(false, true)) {
            frame.close();
            return;
        }
        analyzedFrames++;
        if (analyzedFrames % 3 == 0) {
            String alternative = decodeWithZxing(frame);
            if (alternative != null && !alternative.trim().isEmpty()) {
                qrDetected(alternative);
                analyzing.set(false);
                frame.close();
                return;
            }
        }
        android.media.Image media = frame.getImage();
        if (media == null) {
            analyzing.set(false);
            frame.close();
            return;
        }
        try {
            InputImage input = InputImage.fromMediaImage(media,
                frame.getImageInfo().getRotationDegrees());
            detector.process(input)
                .addOnSuccessListener(barcodes -> {
                    if (finished.get()) return;
                    for (Barcode code : barcodes) {
                        if (code.getFormat() == Barcode.FORMAT_QR_CODE
                            && code.getRawValue() != null && !code.getRawValue().isEmpty()) {
                            qrDetected(code.getRawValue());
                            break;
                        }
                    }
                })
                .addOnCompleteListener(task -> {
                    analyzing.set(false);
                    frame.close();
                });
            if (analyzedFrames % 90 == 0
                && SystemClock.elapsedRealtime() - scanStartedAt > 8000L) {
                runOnUiThread(() -> {
                    if (!finished.get())
                        status.setText("Aún no se detecta el QR. Acércalo, pulsa Ampliar o toca para enfocar.");
                });
            }
        } catch (Exception ignored) {
            analyzing.set(false);
            frame.close();
        }
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
