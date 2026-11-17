# Escáner Android con Google ML Kit — integración incremental

## Estado
La aplicación web de FleboReport se publica desde GitHub Pages. Existe `capacitor.config.json`, pero **no existe todavía un proyecto Android compilable** (`android/`) en la rama main. El puente web para el plugin `FleboIdScanner` es opcional: no se invoca en navegadores normales y mantiene la cámara web como alternativa.

## Arquitectura prevista
- Android: Capacitor + plugin nativo `FleboIdScanner` + CameraX (captura y detección de bordes/encuadre) + ML Kit Text Recognition v2, modelo latino.
- Web, iPad y PC: lector web actual sin cambios de plataforma.
- Contrato del plugin: `scan(): Promise<{cancelled?: boolean, text?: string}>`. El texto se analiza en el JavaScript de `cedula-ocr.js`; los campos detectados siempre se revisan antes de guardar.
- Nunca transmitir imágenes a un servicio OCR externo. La foto debe permanecer en memoria o en caché privada temporal, eliminarse tras el procesamiento y no adjuntarse al expediente.
- Si el usuario cancela o el componente nativo falla, permitir galería o cámara web sin bloquear el formulario.

## Implementación nativa pendiente
1. Generar el proyecto Android Capacitor y configurar la carpeta web compilada, pues `webDir=www` y todavía no existe `www/index.html`.
2. Añadir dependencias compatibles de CameraX y ML Kit Text Recognition, permisos y el registro de `FleboIdScanner`.
3. Implementar captura guiada, enfoque, detección de documento, corrección de perspectiva y OCR en el dispositivo. Devolver exclusivamente texto; no fotografías ni rutas de archivos.
4. Probar reconocimiento de nombres/apellidos, número, fecha y sexo con **documentos sintéticos o de prueba autorizados**, con variantes de iluminación y encuadre. Nunca insertar datos de una cédula real como constantes.
5. Compilar un APK de prueba firmado de forma segura, instalarlo en Android y validar que Jornada, Pacientes y Domicilios rellenen los campos correctos, sin guardar automáticamente.
6. Mantener GitHub Pages operativo sin exigir instalar el APK a usuarios web.

## Precauciones
ML Kit Text Recognition es un motor de texto, no un extractor garantizado de campos panameños. La detección de bordes y la interpretación de nombres requieren validación independiente. No declarar el escáner Android como terminado hasta obtener una compilación y pruebas en un dispositivo real.

## Implementación inicial incorporada (17 de noviembre de 2026)

Se agregó `native/android/FleboIdScannerPlugin.java`: plugin Capacitor con permiso de cámara, captura mediante la aplicación de cámara del dispositivo, foto temporal en caché privada, orientación EXIF y reconocimiento local con Google ML Kit Text Recognition (latín). El plugin devuelve **solo texto** al puente web; borra el archivo temporal antes del OCR y libera el bitmap al finalizar. No hay guardado de imagen en Supabase ni Firebase.

**Importante:** este primer plugin utiliza la cámara del sistema y captura con el botón de disparo; todavía **no** implementa CameraX, autodetección de bordes, corrección de perspectiva ni captura automática. No debe anunciarse como escáner inteligente completo.

### Pasos de integración cuando se genere Android

1. Añadir las dependencias de Capacitor Android (versión compatible con la CLI elegida) y generar `android/` con `npx cap add android`. El `webDir` configurado es `www`; antes se debe preparar un build web local coherente con las rutas y assets actuales. No copiar secretos ni datos clínicos al APK.
2. Copiar `native/android/FleboIdScannerPlugin.java` a `android/app/src/main/java/com/fleboreport/app/FleboIdScannerPlugin.java`.
3. En `android/app/build.gradle`, añadir las dependencias compatibles:
   ```gradle
   implementation 'com.google.mlkit:text-recognition:16.0.1'
   implementation 'androidx.exifinterface:exifinterface:1.3.7'
   ```
4. Registrar el plugin en `MainActivity.java` **antes** de `super.onCreate(savedInstanceState)` con `registerPlugin(FleboIdScannerPlugin.class)` (verificar firma para la versión de Capacitor utilizada).
5. En `AndroidManifest.xml`, declarar permiso de cámara y un `androidx.core.content.FileProvider` con autoridad `${applicationId}.idscanner.provider`, `android:exported="false"`, `android:grantUriPermissions="true"`, y metadato `android.support.FILE_PROVIDER_PATHS` apuntando a `@xml/flebo_idscanner_paths`. El archivo `res/xml/flebo_idscanner_paths.xml` debe contener `<paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="id_scan" path="id-scan/" /></paths>`.
6. Compilar, instalar en un Android de pruebas y verificar permisos, cancelación, orientación, OCR, eliminación de foto temporal y rellenado de campos.

La PWA instalada desde Chrome seguirá usando el OCR web. El APK nativo no está compilado ni probado todavía.
