# FleboReport

Aplicación web instalable para jornadas, atención individual, reportes y trazabilidad de muestras de estudios clínicos.

## Módulos actuales

- Inicio y resumen operativo.
- Empresas, jornadas, pacientes y catálogo de pruebas.
- Reportes PNG, impresión/PDF e historial.
- Atención individual con formularios dinámicos, archivos, firma y edición.
- Estudios clínicos: protocolos, recepción, procesamiento, alícuotas, crioviales y almacenamiento.
- Configuración e historial local de actividad.

## Abrir

Visita [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/). En teléfono se puede agregar a la pantalla de inicio desde el menú del navegador.

## Datos locales y respaldo

La versión publicada actualmente guarda información en el almacenamiento del navegador. No tiene todavía conexión de autenticación ni sincronización Supabase; los datos de distintos navegadores o dispositivos no se comparten. En **Configuración → Datos locales** se puede descargar y restaurar un respaldo JSON. El respaldo incluye información sensible y no está cifrado: protégelo como un expediente.

## Backend Supabase en preparación

El esquema inicial, con usuarios, roles, seguridad por espacio de trabajo, trazabilidad y módulos de operación, está en `supabase/migrations`. Sigue [la guía de configuración](supabase/SETUP.md). La app no se conectará a la nube hasta configurar el proyecto Supabase y su clave pública en el cliente. Nunca publiques una clave `service_role`.

No uses esta app local para expedientes que requieran acceso compartido y controlado hasta terminar la conexión y validación del backend.


## Agenda de domicilios

Consulta supabase/DOMICILIOS.md para el alcance, el modo local y los pasos para activar Supabase y WhatsApp Cloud API.
