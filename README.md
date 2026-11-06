# FleboReport

Aplicación web instalable para jornadas, atención individual, reportes, domicilios y trazabilidad de muestras de estudios clínicos.

## Módulos

- Inicio y resumen operativo.
- Empresas, jornadas, pacientes y catálogo de pruebas.
- Reportes PNG, impresión/PDF e historial.
- Atención individual con formularios dinámicos, archivos, firma y edición.
- Domicilios: agenda, asignaciones, aceptación, seguimiento, calendario, historial y notificaciones.
- Estudios clínicos: protocolos, recepción, revisión, procesamiento, alícuotas, crioviales y almacenamiento.
- Configuración, usuarios, permisos granulares e historial de auditoría.

## Aplicación publicada

Abre [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/). En teléfonos y tablets compatibles se puede instalar desde el menú del navegador.

## Autenticación y datos en la nube

La aplicación publicada utiliza Supabase para autenticación, datos operativos y sincronización. El inicio de sesión utiliza nombre de usuario y contraseña mediante la Edge Function `flebo-username-auth`. El navegador solo contiene la clave publicable de Supabase; nunca debe contener una clave `service_role` o secreta.

La persistencia tiene distintos alcances:

- El estado general de la aplicación se sincroniza por espacio de trabajo y usuario autenticado, para que la misma cuenta pueda continuar desde sus dispositivos.
- Los expedientes de pacientes, domicilios y registros de Estudios Clínicos se almacenan en tablas del espacio de trabajo y se protegen mediante RLS y permisos.
- No se debe asumir que todos los datos del estado general de un usuario se comparten automáticamente con todos los demás miembros. Cada módulo tiene su propio modelo de persistencia y acceso.

## Respaldo

La interfaz incluye opciones para descargar y restaurar un respaldo JSON. Ese archivo puede contener información sensible: protégelo y no lo compartas por canales públicos. El respaldo de la aplicación no sustituye las copias de seguridad administradas de la base de datos Supabase.

## Supabase y migraciones

El proyecto Supabase de FleboReport está activo. La base de datos tiene RLS habilitado en las 53 tablas públicas revisadas.

**Migraciones Supabase:** `supabase/migrations/` fue reconstruido desde las 81 entradas del registro remoto (`schema_migrations`); las 81 versiones y nombres coinciden exactamente. Los 61 archivos anteriores se conservaron en `supabase/migration_archive/current-main/` y las fuentes recuperadas se copiaron desde el SQL registrado, sin ejecutar cambios en producción. Antes de aplicar una migración nueva, valida el resultado de `supabase migration list` con el proyecto enlazado. Consulta [supabase/SETUP.md](supabase/SETUP.md).

Las Edge Functions se despliegan por separado de GitHub Pages. Publicar la web no actualiza automáticamente las funciones de Supabase.
