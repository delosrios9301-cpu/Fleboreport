# Auditoría integral de FleboReport — 12 de noviembre de 2026

**Alcance:** GitHub `main`, flujos de UI/JS/PWA, Supabase de producción (solo lectura salvo corrección de permisos SQL de ejecución), RLS, RPC, sincronización, datos agregados, notificaciones, pruebas y despliegue. Auditoría sin pruebas físicas en Android/iPad/PC y sin ejecutar escenarios de escritura clínica reales.

## Verificación
- GitHub commit de referencia: `a83731a7044c5a8700e0cc54abb0fbf180af8c10`; CI de calidad, GitHub Pages y Android APK exitosos para este commit.
- Base de datos de Supabase: 60 tablas en `public`, todas con RLS activo. `workspace_shared_app_state` carece deliberadamente de políticas de acceso directo y se maneja mediante RPC con comprobación de pertenencia; no crear políticas abiertas.
- Pacientes: 23 filas, ningún grupo de cédula normalizada duplicada. Índice único `patients_workspace_document_normalized_uidx`.
- Domicilios: 39 visitas y 39 asignaciones. Muestras clínicas: 25. La consulta agrega datos, sin leer ni publicar identidades.
- Estado compartido: un registro JSON de ~596 KiB, revisión 207. En su objeto hay una empresa, aunque la tabla `companies` está vacía: coexistencia real de estados, no prueba de pérdida.
- Historial central: ~13 724 entradas; 1 064 operaciones rotuladas «Abrir menú de módulos» en `app_activity` y numerosas interacciones de foco en campos de acceso, sin evidencia de almacenamiento de contraseñas.
- Supabase Advisor: 21 avisos de RPC `SECURITY DEFINER` accesibles a usuarios autenticados; un aviso de protección de contraseñas filtradas desactivada; 87 referencias externas sin índice de cobertura y 20 índices sin uso observado. Esos avisos deben priorizarse por uso real, no tratarse como fallos automáticamente.

## Correcciones de esta intervención
1. **Seguridad (media):** revocar `EXECUTE` al rol anónimo en cinco RPC operativas que ya requieren sesión y rol: `save_workspace_app_state`, `search_workspace_patients`, `sync_workspace_patient`, `upsert_clinical_sample_type_config` y `upsert_clinical_visit_config`. Mantener explícitamente el acceso de `authenticated` y `service_role`. Migración `20261112152720_revoke_anonymous_operational_rpcs.sql`.
2. **Auditoría/ruido de navegación (media):** `app-activity-cloud.js` deja de generar eventos nuevos por abrir el menú y enfocar campos «Usuario» o «Contraseña», sin filtrar registros clínicos ni cambios guardados. Historial ya existente permanece intacto.
3. **Consistencia visual (baja):** `audit-history.js` integra la clase `fr5-screen` para heredar el lenguaje visual Clinical Modern sin cambiar su búsqueda, exportación ni permisos.
4. **Pruebas:** cobertura estática para las tres modificaciones anteriores.

## Hallazgos que requieren intervención aislada y pruebas de regresión de permisos
- **Acceso a datos compartidos (alto, arquitectónico):** `get_workspace_shared_app_state` y `save_workspace_shared_app_state` autorizan por pertenencia a roles, pero el estado JSON incluye módulos con información clínica y de pacientes. No hay aislamiento granular por clave JSON. Diseñar separación por módulo (o proyección segura por rol) y escrituras con comprobación de claves antes de endurecer producción; cambiar hoy un permiso de lectura o reemplazar el JSON completo podría dejar sin datos operativos a roles autorizados.
- **Acceso privilegiado (revisión obligatoria):** 21 funciones `SECURITY DEFINER` ejecutables por `authenticated`, la mayoría con control explícito de `auth.uid()` y roles. Revisar función a función, especialmente los flujos de administración, reportes y estados compartidos; no revocar indiscriminadamente una RPC que usa la app.
- **RLS (aclaración):** en Pacientes, Jornada, Empresas y Reportes existe una política `RESTRICTIVE` de permisos granulares además de una `PERMISSIVE`. PostgreSQL aplica ambas: la existencia de reglas superpuestas no demuestra bypass. Las visitas domiciliarias combinan restricciones granulares y del técnico asignado.
- **Rendimiento de sincronización:** `cloud-state-sync.js` usa CAS de revisión y sincronización por sondeo; el JSON compartido ya ocupa ~596 KiB. Reducir cambios de estado completos y considerar partición por módulo en desarrollo/staging, con cobertura multi-dispositivo y rollback.
- **Rendimiento de base de datos:** no crear masivamente los 87 índices sugeridos ni eliminar los 20 sin uso sin `EXPLAIN ANALYZE`, métricas y volumen representativo. Priorizar expedientes, asignaciones, muestras e historial según latencia real.
- **Configuración de Auth:** revisar la recomendación oficial para activar protección contra contraseñas comprometidas en el panel de Supabase. No se modificó esta opción.
- **UI multidispositivo:** sin inspección física; confirmar en Android, iPad y PC desplazamiento, elementos fijos, scroll horizontal de tablas, notificaciones, cierre de sesión y las vistas de todos los módulos.

## Restricciones observadas
- No se ejecutaron pruebas de creación, eliminación o modificación de pacientes, muestras, visitas o reportes en producción.
- No se fusionaron ni se eliminaron registros existentes, no se tocaron datos clínicos, no se hicieron restablecimientos.
- Un CI exitoso valida lo que sus pruebas cubren; no sustituye pruebas E2E de roles, conectividad ni rendimiento en hardware real.
