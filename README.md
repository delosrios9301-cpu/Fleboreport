# FleboReport

Aplicación web instalable en teléfonos para preparar reportes de jornada sin nombres de pacientes. Se adapta a pantallas pequeñas y puede abrirse sin conexión después de la primera carga.

## Instalar en el teléfono

Abre [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/) desde el navegador del teléfono:

- **Android (Chrome):** abre el menú ⋮ y selecciona **Instalar app** o **Añadir a pantalla de inicio**.
- **iPhone o iPad (Safari):** toca **Compartir** y selecciona **Añadir a pantalla de inicio**.

Después, abre FleboReport desde el nuevo icono de la pantalla de inicio para usarla como aplicación. Cárgala una vez con conexión para que sus archivos queden disponibles sin conexión.

## Datos guardados

El laboratorio, el catálogo y las jornadas se conservan en este dispositivo para continuar luego. No se sincronizan entre dispositivos ni se envían a un servidor. La app guarda en caché sus archivos de funcionamiento para abrirlos sin conexión.

## Uso en el teléfono

El panel principal guía el reporte con botones **Siguiente** y **Anterior** en tres pasos: Jornada, Pruebas y Reporte. La configuración del laboratorio y del catálogo vive en el módulo separado **Configuración**.

## Uso

1. Configura el nombre, contacto y logotipo del laboratorio. El logotipo se usa como una sola marca de agua, ampliada y semitransparente en el PDF y el PNG.
2. Define la fecha, las horas y el responsable de la jornada.
3. Crea en el catálogo las pruebas que uses y ajusta la forma del recipiente y su color. Cada prueba comienza pendiente de validación clínica; confirma el protocolo según tu laboratorio.
4. Pulsa `+` una vez por cada prueba realizada. FleboReport agrupa las pruebas iguales y suma cantidades y recipientes.
5. Selecciona **Infografía** o **Formal**.
6. Usa **Descargar PNG** o **Imprimir / PDF**.

El reporte no muestra nombres de pacientes ni los detalles clínicos del recipiente debajo de cada prueba: muestra el nombre de la prueba y la cantidad realizada. La ilustración, forma y color del recipiente son ajustes visuales y no requieren validación.

## Publicación

El sitio está alojado en [GitHub Pages](https://delosrios9301-cpu.github.io/Fleboreport/). El flujo `/.github/workflows/pages.yml` vuelve a publicar la versión nueva al subir cambios a `main`.