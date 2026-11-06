# Archivo de migraciones anteriores

Este directorio conserva, sin ejecutar, los 61 archivos SQL que estaban en `supabase/migrations/` antes de la reconstrucción del historial.

La carpeta activa `supabase/migrations/` fue reconstruida a partir de las 81 entradas registradas en `supabase_migrations.schema_migrations` del proyecto Supabase conectado. Cada archivo activo usa la versión y el nombre registrados remotamente y contiene la sentencia SQL almacenada por Supabase.

Los archivos originales se conservan aquí para auditoría y recuperación. No deben copiarse ni aplicarse automáticamente. En la comparación se identificaron cuatro archivos antiguos que eran alias de migraciones remotas, tres archivos locales sin entrada remota por nombre y 25 fuentes cuyo contenido difería del SQL registrado. La reconstrucción usó el SQL del registro remoto como fuente activa y preservó todas las versiones anteriores. No se modificaron tablas, funciones, permisos ni datos de producción.

Antes de ejecutar cualquier migración nueva, verificar `supabase migration list` contra el proyecto enlazado y revisar cualquier diferencia. No ejecutar `supabase db push` como parte de esta recuperación.
