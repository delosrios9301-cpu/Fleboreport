# Publicación segura de FleboReport Android

## Antes de publicar
La versión 1.2 generada por GitHub Actions es **debug**. Android no permite actualizar una instalación debug con un APK release firmado con otra clave. **No desinstales la aplicación actual ni borres sus datos** antes de respaldar y verificar la migración de cualquier dato local.

## 1. Crear una firma permanente (una sola vez)
En una computadora con Java JDK instalado, ejecutar:

```bash
keytool -genkeypair -v -keystore fleboreport-release.jks -alias fleboreport -keyalg RSA -keysize 3072 -validity 10000
```

Elegir contraseñas fuertes, guardarlas en un gestor seguro y mantener una copia cifrada del archivo JKS fuera del repositorio. **No compartir el JKS ni las contraseñas por chat ni subirlos a GitHub como archivos.** La pérdida de esta firma impide actualizar instalaciones firmadas con ella.

## 2. Configurar secretos de GitHub Actions
En el repositorio, ir a Settings > Secrets and variables > Actions > New repository secret. Crear:
- `ANDROID_KEYSTORE_BASE64`: contenido del JKS codificado en Base64 en una sola línea (en Linux: `base64 -w 0 fleboreport-release.jks`; en macOS: `base64 < fleboreport-release.jks | tr -d '\n'`).
- `ANDROID_KEYSTORE_PASSWORD`: contraseña del JKS.
- `ANDROID_KEY_ALIAS`: `fleboreport`.
- `ANDROID_KEY_PASSWORD`: contraseña de la clave.

No colocar valores reales en archivos del repositorio.

## 3. Publicar
Primero actualizar `versionCode` y `versionName` en `native/android/configure_android.py` y comprobar que el código de versión sea mayor al anterior. En GitHub > Actions > Publicar APK Android firmado > Run workflow, indicar exactamente la versión del archivo (por ejemplo, 1.3). El flujo compila, firma, verifica y crea un GitHub Release con `FleboReport-VERSION.apk`.

**No ejecutar hasta configurar los cuatro secretos.** El flujo falla de forma segura si faltan.

## 4. Activar la descarga desde la aplicación
Solo después de confirmar que existe el APK firmado publicado, actualizar `android-update.json` con `versionCode`, `versionName` y:

```json
"apkUrl": "https://github.com/delosrios9301-cpu/Fleboreport/releases/download/android-v1.3/FleboReport-1.3.apk"
```

El aviso Android ya reconoce `apkUrl` y abre el APK directamente. La instalación requiere confirmación del usuario y permisos de Android para instalar aplicaciones de esa procedencia.

## 5. Verificación obligatoria
En un Android de prueba, instalar una versión release firmada con la clave permanente, registrar datos ficticios, publicar una versión con `versionCode` superior y comprobar que el aviso aparece, el APK descarga, Android instala sobre la anterior y los datos ficticios permanecen. No hacer esta prueba con datos clínicos reales.

La versión web en iPad y PC no necesita instalar APK.
