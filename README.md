# FleboReport

Aplicación web adaptable a computadora y teléfono para registrar jornadas, configurar el laboratorio y el catálogo de pruebas, y preparar reportes por período.

## Abrir la aplicación

Visita [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/). En teléfono puedes agregarla a la pantalla de inicio desde el menú del navegador.

## Uso

- **Inicio** muestra el resumen y accesos a jornada, pacientes, pruebas y configuración.
- **Jornadas** permite indicar fecha y horario, agregar pruebas y consultar conteos agrupados.
- **Pacientes** permite mantener el registro local de pacientes y estados de muestra.
- **Pruebas y configuración** permiten administrar el catálogo, el laboratorio y el logo de fondo.
- **Reportes** presenta los conteos de pruebas y recipientes. La impresión y la imagen omiten el nombre y documento del paciente.
- Los estilos de reporte y la exportación PNG/PDF siguen disponibles.

Los reportes resumen el horario y las cantidades por tipo de prueba (por ejemplo, HCG o antidoping). El catálogo inicia vacío y los requisitos de laboratorio se mantienen pendientes hasta que un administrador los configure y confirme. Los colores de tubos y frascos son configurables como elementos visuales.

## Almacenamiento

La aplicación es estática y conserva el catálogo, la configuración y los registros en el almacenamiento local del navegador/dispositivo. No hay servidor de pacientes ni sincronización automática entre dispositivos. Antes de borrar los datos del navegador, exporta o conserva la información necesaria.

## Publicación

El sitio se publica con GitHub Pages desde la rama principal. El service worker renueva su caché para que la versión actualizada aparezca en la app instalada.
