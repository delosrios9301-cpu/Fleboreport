# Auditoría de resolución de hallazgos — FleboReport
**Fecha:** 12 de noviembre de 2026
**Versión:** v285 · rama `main`
**PR de privacidad:** #72 · **PR de permisos internos/índices:** #73

## Resumen de verificación
Se corrigió el acceso previo a aceptar domicilios: el nuevo
`list_home_visit_invitation_previews` expone únicamente fecha, hora,
prioridad e identificadores de asignación al usuario asignado. La política
restrictiva de `home_visits` solo permite obtener dirección, teléfono,
notas y relaciones clínicas con permiso de gestión o tras aceptación por
un miembro **activo**. Los documentos, pruebas y eventos ya requerían
asignación aceptada o gestión. El aviso Push de nueva asignación no incluye
datos personales de la visita.

Se restringió la ejecución directa a `anon` y `authenticated` de cinco
funciones privadas internas: registro y notificación de muestras,
seguimiento de cambios, alertas de coagulación y restablecimiento privado.
Los disparadores continúan funcionando y los cron de alertas siguen
activos bajo la cuenta de servicio `postgres`.

Se añadieron dos índices dirigidos a la lectura de invitaciones y a
la última asignación. No se crearon masivamente índices para tablas
pequeñas ni se borraron índices sin analizar sus consultas y uso real.

## Pruebas y comprobaciones
| Validación | Resultado |
|---|---|
| Pruebas generales GitHub Actions | 156 aprobadas, 0 fallidas |
| PostgreSQL 17 CI | Aprobada: anonimato, invitaciones, aceptación, membresía inactiva, funciones internas y escrituras con trigger |
| GitHub Pages v285 | Publicado correctamente |
| Compilación Android | Completada correctamente |
| Registros | 23 pacientes, 25 muestras, 39 domicilios, 39 asignaciones |
| Auditoría inmutable existente | 13.725 eventos |
| Pacientes duplicados por cédula normalizada | 0 grupos |
| Backfill modular | 9/9 tablas privadas, paridad JSON exacta |
| Checkpoint privado | Checksum válido |
| Lecturas directas anon a nuevas RPC | Denegadas |
| Alertas SLA/coagulación | Jobs activas |

No existían invitaciones activas en producción durante la verificación;
el caso previo a la aceptación se ensayó con datos ficticios en PostgreSQL
y sin registrar eventos de prueba en los datos clínicos reales.

## Auditoría de riesgos pendientes y decisiones
### 1. JSON de compatibilidad: mantener protegido (pendiente retirada)
Las nueve tablas físicas están creadas y validadas; el sistema actual
utiliza lecturas y escrituras modulares. Sin embargo, el JSON de
`workspace_shared_app_state` sigue replicándose para APK/PWA antiguos,
para el reinicio administrativo y para rutas multi-módulo compatibles.
Borrarlo ahora, sin comprobar todas las versiones instaladas, pondría
en riesgo jornadas y reportes. **No se ha retirado el espejo**.

### 2. Protección de contraseñas filtradas: bloqueada por plan externo
El proyecto Supabase figura en **Free**. La protección nativa de
contraseñas filtradas de Supabase está disponible solo en **Pro y superiores**:
https://supabase.com/docs/guides/auth/password-security
No se autorizó contratar ni activar un plan de pago. El sistema mantiene
autenticación y permisos existentes; verificar contraseñas robustas y
configuración Auth gratuita sigue siendo aconsejable. No se deshabilitó
ni se modificó el acceso actual.

### 3. SECURITY DEFINER: revisión, no supresión indiscriminada
Tras las correcciones, el asesor de Supabase sigue indicando **27 RPC
públicas SECURITY DEFINER accesibles a usuarios autenticados**. La
aplicación depende de estas RPC para funciones autorizadas; revocarlas
todas rompería permisos, guardados, muestras y reportes. La revisión
automática no encontró RPC públicas privilegiadas sin referencia a
`auth.uid()`, `is_workspace_member` o al restablecimiento privado
autorizado. No se observó ejecución anónima habilitada en las RPC
modulares ni de invitaciones; continuar revisión de casos de borde.

### 4. Rendimiento: optimización sin eliminación destructiva
El asesor de rendimiento muestra 86 claves foráneas sin índices de
cobertura y 22 índices con cero usos observados. Se añadieron **dos índices
específicos** para el flujo de invitaciones. Muchos de los restantes
avisan sobre tablas pequeñas o consultas raras. Añadir 86 índices o
borrar los 22 sin un análisis real de consultas elevaría el costo de
escrituras y podría dañar el rendimiento.

### 5. Almacenamiento externo y logotipos
El respaldo de recuperación de FleboReport está dentro de Supabase;
no sustituye una copia cifrada **fuera del proyecto** o PITR. No se ha
movido información clínica a servicios externos ni se ha creado un
destino de almacenamiento fuera de Supabase sin autorización.

Los campos gráficos de Empresas y Reportes siguen ocupando
aproximadamente 285 y 292 KB. Una futura normalización a Storage
requiere preservar los archivos, enlaces de PDF/PNG, los permisos y
las versiones instaladas; no se eliminaron las imágenes actuales.

### 6. Ensayos reales
No se ha completado una prueba E2E con dos sesiones reales en
Android, iPad y PC, ni se ha verificado en hardware antiguo que
todas las versiones reciban la actualización OTA. Los APK antiguos
deben actualizarse para recibir invitaciones con la nueva API
segura; el bloqueo de la información sensible se mantiene en servidor.

## Decisión de cierre
**Cerrados y publicados:** exposición previa a aceptar domicilio,
acceso tras desactivación de usuario, cinco ejecuciones privadas
innecesarias, índices focalizados y regresiones CI.

**Aún abiertos por seguridad/servicio externo:** retirada del JSON de
compatibilidad, protección de contraseñas filtradas limitada al plan
Pro, respaldo externo, normalización de logotipos y pruebas reales
multidispositivo.

No se garantiza ausencia absoluta de fallas; se han preservado los
datos existentes, el diseño, las sesiones y los procedimientos
clínicos sin eliminaciones ni restablecimientos.
