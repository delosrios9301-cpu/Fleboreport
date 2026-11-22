package com.fleboreport.app;

/**
 * Proveedor exclusivo para compartir informes y APK firmados.
 * Evita reutilizar la clase FileProvider registrada por Capacitor.
 * El acceso a cada archivo solo se concede mediante FLAG_GRANT_READ_URI_PERMISSION.
 */
public final class TalcsysPrivateFileProvider extends androidx.core.content.FileProvider {
    public TalcsysPrivateFileProvider() { super(); }
}
