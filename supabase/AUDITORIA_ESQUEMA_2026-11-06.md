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


## Segunda pasada: consultas y carga de datos (6 de noviembre de 2026)

Se contrastaron las consultas del cliente con índices y estadísticas actuales de PostgreSQL. Las métricas de `pg_stat_user_tables` son acumuladas desde el último reinicio/reset de estadísticas y deben interpretarse como señales, no como latencias por usuario.

### Domicilios

- La agenda descarga hasta 5.000 domicilios por espacio de trabajo con pruebas, eventos, documentos, pacientes adicionales y asignaciones relacionadas.
- La agenda y el historial filtran y ordenan posteriormente en el cliente. El índice `home_visits_schedule_idx (workspace_id, scheduled_at, status)` cubre el filtro de espacio y orden temporal principal.
- Las tablas hijas tienen índices por `(workspace_id, home_visit_id)` o por fecha descendente, adecuados para cargar el detalle de cada domicilio.
- La búsqueda del historial de paciente consulta hasta 20 domicilios por paciente y ya filtra por espacio y paciente.
- No se observó evidencia de que falte un índice principal para la consulta de agenda; el riesgo de escalabilidad está en transferir todos los domicilios y relaciones cada vez que se refresca la agenda.

### Asignaciones de domicilios

- `home_visit_assignments` registró 511.028 exploraciones secuenciales frente a 474.944 búsquedas por índice, con 27 filas vivas y 37 muertas en el snapshot.
- La función `is_current_home_visit_assignee` consulta la tabla dos veces para validar la asignación más reciente y su estado. La subconsulta de la última asignación ordena por `workspace_id, home_visit_id, assigned_at DESC, id DESC`; el índice único parcial existente solo cubre asignaciones `invited/accepted` y no sustituye por completo ese patrón de ordenación.
- Un índice compuesto que cubra ese orden es candidato a evaluación, pero no se creó: el plan observado con el volumen actual ejecutó en aproximadamente 0,2 ms y la tabla tiene muy pocas filas. Debe medirse de nuevo cuando aumente el volumen y revisar la función/políticas RLS antes de decidir.

### Estudios clínicos y procesamiento

- La sincronización descarga hasta 5.000 muestras activas, hasta 10.000 eventos clínicos y todos los contenedores del espacio de trabajo. Los límites reducen el riesgo de respuesta ilimitada, pero la carga completa de eventos y muestras en cada sincronización puede crecer de forma innecesaria.
- Los índices existentes cubren la cola de muestras por `(workspace_id, received_at DESC)` con filtro de borrado lógico, las colas por estado y el historial de eventos por `(workspace_id, sample_id, occurred_at DESC)`.
- Las estadísticas del snapshot mostraron 7 muestras vivas y 39 eventos clínicos vivos. La consulta de eventos por espacio de trabajo tardó alrededor de 1,1 ms en el volumen actual; no justifica todavía un cambio de índice.
- El principal trabajo futuro es paginar/incrementalizar la sincronización de eventos y muestras, preservando el orden cronológico y la consistencia de la bandeja. No se cambió el protocolo de sincronización en esta pasada.

### Decisión de rendimiento

No se ejecutaron cambios DDL ni se eliminaron índices. Los datos actuales no demuestran un cuello de botella de consulta que justifique modificar producción. Se recomienda priorizar una futura optimización de carga incremental/paginada para Domicilios y Estudios Clínicos, y volver a medir la función de asignaciones conforme crezca su tabla.

## Resultado

La estructura crítica revisada está activa y protegida por RLS. No se identificó una causa que justifique una migración correctiva inmediata sin más análisis. Los pendientes principales son la configuración de contraseñas filtradas y la optimización de índices guiada por planes de ejecución.
