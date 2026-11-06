# Auditoría de esquema y seguridad — 6 de noviembre de 2026

## Alcance

Revisión de solo lectura del proyecto Supabase de FleboReport. No se ejecutaron migraciones ni se modificaron tablas, políticas, funciones, índices, permisos o datos.

## Estado general observado

- Proyecto: activo y saludable.
- PostgreSQL: 17.11.0.011.
- Esquema `public`: 53 tablas; las 53 tienen RLS habilitado.
- Políticas RLS: 329.
- Funciones en `public`: 54.
- Vistas en `public`: ninguna.
- Disparadores no internos: 181.
- Historial remoto: 81 migraciones; las 81 tienen una única fuente SQL almacenada en `supabase_migrations.schema_migrations`.
- Directorio activo del repositorio: 81 archivos con versión y nombre coincidentes con el historial remoto.
- Los 61 archivos anteriores se conservan en `supabase/migration_archive/current-main/`.

La coincidencia de versión y nombre confirma la alineación del inventario de migraciones; no equivale por sí sola a una comparación binaria de cada definición de objeto contra todo el catálogo de PostgreSQL.

## Seguridad

### RLS y acceso por módulo

No se encontraron tablas de `public` con RLS deshabilitado. Se revisaron las políticas de pacientes, domicilios, asignaciones, eventos, pruebas, documentos, muestras clínicas, permisos y estado de aplicación.

Las tablas críticas de domicilios y pacientes incluyen políticas restrictivas adicionales que se combinan con las políticas permisivas. Las políticas de `audit_logs`, `member_permissions`, `role_permissions` y `workspace_app_state` no tienen una política restrictiva paralela, pero sus predicados limitan el acceso por administrador, miembro, usuario propietario o permiso de auditoría según corresponda. No se confirmó un bypass de RLS en esta revisión estática.

### Funciones SECURITY DEFINER

- 15 funciones SECURITY DEFINER de `public` pueden ejecutarse con el rol `authenticated`.
- Ninguna de esas funciones es ejecutable por `anon`.
- Las funciones revisadas fijan `search_path` vacío.
- Las funciones operativas verifican identidad, rol o permiso. La RPC pública de reinicio delega en una función privada que comprueba sesión, frase de confirmación, propietario y administrador principal protegido.
- Las funciones internas de notificación y auditoría están restringidas a su uso interno.

### Ajuste pendiente de Auth

El asesor de Supabase informa que la protección contra contraseñas filtradas está deshabilitada. Se debe activar en Supabase Dashboard, en la configuración de Auth / seguridad de contraseñas. No es un cambio que se deba simular mediante SQL.

## Rendimiento

Los asesores informan:

- 82 claves foráneas sin índice de cobertura.
- 25 índices sin uso observado.
- 2 pares de índices duplicados.

Las alertas de índice no se resolvieron automáticamente. Algunos índices duplicados muestran actividad en `pg_stat_user_indexes`; uno de los índices únicos de pacientes respalda además una restricción de unicidad y relaciones foráneas. No se debe eliminar ninguno sin revisar dependencias, consultas reales y planes `EXPLAIN`.

Prioridad para el siguiente análisis de rendimiento: claves foráneas y consultas de `clinical_samples`, `home_visits`, `home_visit_assignments`, `home_visit_events`, `home_visit_tests`, `patients` y `workspace_app_state`.

## Hallazgos funcionales de esquema

- `clinical_samples.patient_id` y `tube_barcode` admiten NULL, coherente con el registro actual sin paciente maestro ni código de barras obligatorio.
- `workspace_app_state` está separado por `workspace_id + user_id`, evitando que el estado general de un usuario se mezcle con el de otro.
- La función actual de transición clínica no consulta cajas ni crioviales y conserva un estado final denominado `CONGELADOR_DEFINITIVO`; las tablas antiguas de cajas/crioviales permanecen en el esquema como legado.
- Los disparadores de auditoría, trazabilidad de domicilios y control de transiciones están presentes en el catálogo revisado.

## Decisiones seguras

1. No ejecutar `supabase db push`, `migration repair` ni SQL de cambios de esquema como parte de esta auditoría.
2. No eliminar índices duplicados o no usados sin revisar planes y dependencias.
3. Habilitar la protección contra contraseñas filtradas desde la configuración de Supabase Auth.
4. Continuar con planes `EXPLAIN` de consultas frecuentes y medir el impacto antes de crear índices para las claves foráneas sin cobertura.
5. Mantener el archivo de migraciones anterior como respaldo de auditoría; no aplicarlo.

## Resultado

La estructura crítica revisada está activa y protegida por RLS. No se identificó una causa que justifique una migración correctiva inmediata sin más análisis. Los pendientes principales son la configuración de contraseñas filtradas y la optimización de índices guiada por planes de ejecución.
