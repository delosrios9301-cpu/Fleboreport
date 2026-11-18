package com.fleboreport.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Mantiene visible la barra de Android (hora, red, batería y avisos).
 * En Android 15+ el contenido se ajusta a los insets obligatorios de
 * edge-to-edge sin cubrir la cabecera ni la navegación inferior.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FleboIdScannerPlugin.class);
        super.onCreate(savedInstanceState);
        configureSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        showSystemBars();
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        if (Build.VERSION.SDK_INT >= 35) {
            // Android 15+ aplica edge-to-edge; reservar los insets físicamente.
            WindowCompat.setDecorFitsSystemWindows(window, false);
            View root = findViewById(android.R.id.content);
            root.setBackgroundColor(Color.WHITE);
            ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                // El WebView no debe aplicar dos veces los mismos insets.
                return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                    .build();
            });
            ViewCompat.requestApplyInsets(root);
        } else {
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.setStatusBarColor(Color.WHITE);
        }
        showSystemBars();
    }

    private void showSystemBars() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        View decor = window.getDecorView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(true);
        controller.show(WindowInsetsCompat.Type.statusBars()
            | WindowInsetsCompat.Type.navigationBars());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
