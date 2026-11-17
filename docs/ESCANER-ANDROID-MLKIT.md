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
