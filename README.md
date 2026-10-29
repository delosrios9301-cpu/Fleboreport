# FleboReport

Aplicación web en español para preparar un reporte de jornada sin nombres de pacientes. No requiere instalación ni servidor y se adapta a pantallas de teléfono y tableta.

## Uso

1. Abre `index.html` en un navegador actualizado.
2. Completa el nombre, contacto y logotipo del laboratorio. El logotipo aparece una sola vez, ampliado como fondo semitransparente a página completa en el PDF y el PNG, detrás del contenido; no aparece junto al nombre del laboratorio.
3. Define la fecha, hora de inicio y fin, y el responsable de la jornada.
4. Pulsa el botón `+` del catálogo una vez por cada prueba realizada. El reporte agrupa las pruebas iguales y suma las cantidades.
5. Selecciona **Infografía** o **Formal**.
6. Usa **Descargar PNG** para guardar una imagen o **Imprimir / PDF** y elige “Guardar como PDF” en el diálogo de impresión.

El reporte no incluye nombres ni datos individuales de pacientes. En cada prueba muestra solo el nombre y la cantidad; los detalles de muestra, recipiente, color y volumen permanecen en el catálogo y no se imprimen debajo de la prueba. La cantidad de cada prueba se registra mediante las veces que se añade al resumen; el total general es la suma de todas las pruebas. El catálogo comienza vacío para que configures las pruebas y sus recipientes desde cero. Puedes elegir la forma ilustrativa (automática, tubo o frasco) y un color de la paleta o personalizado desde el catálogo. La forma y el color son ajustes visuales y no requieren validación. Administra el catálogo para ingresar los requisitos definidos por tu laboratorio y confirma la validación clínica únicamente después de revisar el método y protocolo local. Cada prueba nueva empieza pendiente de validación clínica.

## Datos y publicación

La información se guarda en el almacenamiento local del navegador de ese dispositivo y no se envía a un servidor. El reporte actual se conserva en el navegador al recargar. Pulsa **Nueva jornada** para limpiar cantidades y horario antes de empezar otro reporte. Para publicar, sirve la carpeta `outputs` como un sitio estático y abre la dirección publicada. La versión local no sincroniza entre dispositivos ni usuarios.

La tipografía visual usa Google Fonts cuando hay conexión; el resto de la aplicación y las exportaciones funciona sin servicios externos.
## Publicación en GitHub Pages

El flujo `/.github/workflows/pages.yml` publica automáticamente la carpeta del sitio cuando se sube a la rama `main`. En el repositorio, selecciona **Settings → Pages → Build and deployment → GitHub Actions**. El enlace del sitio aparecerá en la sección **Pages** cuando termine la primera publicación.

La aplicación guarda sus datos en el navegador local. No hay servidor ni base de datos vinculados al repositorio.