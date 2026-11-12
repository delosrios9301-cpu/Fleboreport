# Auditoría posterior a migración física modular — FleboReport

**Fecha:** 12 de noviembre de 2026
**Repositorio:** `delosrios9301-cpu/Fleboreport`, `main`
**Versión visual/PWA:** v284
**Commit de migración auditado:** `81a634c2d527da3a696cbff8a3a4dba4ba8625a9`
**Estado:** extracción física y despliegue verificados; **no declarar retirada de la compatibilidad legada ni homologación multidispositivo**.

## 1. Alcance
Código, esquema SQL de producción Supabase, controles de acceso, permisos API,
sincronización, conciliación del estado, concurrencia, respaldos y procesos
automatizados. No se realizó un reset real ni se cambiaron pacientes en producción.
Las pruebas de escritura sobre cuentas autorizadas se hicieron dentro de una
transacción explícita con `ROLLBACK`.

## 2. Migración y paridad
Se crearon y poblaron nueve tablas físicas privadas independientes:

| Módulo | Tabla física | Tamaño del payload |
|---|---|---:|
| Pacientes (estado legado) | `private.fr_module_patients` | 4.811 bytes |
| Jornada | `private.fr_module_journeys` | 1.376 bytes |
| Empresas | `private.fr_module_companies` | 284.662 bytes |
| Reportes | `private.fr_module_reports` | 291.619 bytes |
| Catálogo | `private.fr_module_catalog` | 1.328 bytes |
| Atenciones | `private.fr_module_attentions` | 537 bytes |
| Clínica heredada | `private.fr_module_clinical` | 2.148 bytes |
| Configuración | `private.fr_module_settings` | 114 bytes |
| Campos adicionales | `private.fr_module_extras` | 5 bytes |

Cada tabla tiene una fila para el workspace existente, revisión independiente,
RLS activado y acceso directo denegado a `anon`/`authenticated`.

**Comprobación clave:** concatenar las nueve cargas físicas produce un JSONB
exactamente igual al estado anterior. La compatibilidad original mantiene
revisión 208 y 610.584 bytes. No se descartaron claves. El trigger de
replicación actúa en la misma transacción para versiones anteriores.

**Entidades relacionales oficiales:** 23 pacientes, 25 muestras clínicas,
39 domicilios, 39 asignaciones; 13.725 entradas de auditoría. No hay
grupos de pacientes duplicados por cédula normalizada.

## 3. Seguridad y concurrencia
- Nueve de nueve tablas modulares tienen RLS habilitado; ninguna admite
  lectura directa desde roles API normales.
- Los nuevos RPC modulares **no** son ejecutables por `anon`. Sus ejecuciones
  para `authenticated` están limitadas por sesión, pertenencia, rol y
  permisos granulares.
- Una lectura modular administrativa devolvió las 36 claves esperadas
  y las nueve revisiones.
- El aislamiento del visor se comprobó con usuarios sintéticos en PostgreSQL;
  el entorno de producción **no tiene una cuenta primaria `viewer` activa**
  para ensayos reales.
- Con una transacción reversible de producción, una edición de Reportes
  (Administrador) y otra de Jornada (Coordinación) conservaron ambos
  cambios aunque avanzara la revisión global. Una edición obsoleta del
  mismo módulo se rechazó. Toda la transacción se revirtió.
- La limpieza de las nuevas tablas ante borrado del estado legado se
  comprobó con `ROLLBACK` en integración PostgreSQL. No se ejecutó
  el reset administrativo de producción.

## 4. Verificación de publicación
- 149 pruebas generales aprobadas; 0 fallidas.
- PostgreSQL 17: pruebas de integración aprobadas, incluidas las de
  privacidad, paridad, revisiones, concurrencia y restablecimiento.
- GitHub Pages/OTA v284: despliegue concluido con éxito.
- Compilación Android para el commit auditado: concluida con éxito.
- Punto privado de recuperación preexistente: checksum válido.
- Asesor de salud Supabase: sin alertas en la consulta realizada.

Las pruebas CI no equivalen a pruebas manuales con dispositivos reales.

## 5. Hallazgos pendientes
**P1 — Decomisión del JSON de compatibilidad.** La separación física está
aplicada, pero `workspace_shared_app_state` sigue existiendo como
espejo temporal para las PWA/APK anteriores. El cliente nuevo lee las tablas
modulares y envía ediciones de un solo módulo por su RPC específico; cambios
de varios módulos usan la ruta transaccional heredada. No se debe borrar
el espejo mientras existan versiones antiguas o dependencias del reset
sin una ventana de migración controlada. Esto impide llamar a la
arquitectura «100 % desacoplada».

**P1 — Privacidad de domicilios antes de aceptar.** La política RLS de
`home_visits` permite que el asignado con estado `invited` lea toda la
fila, que incluye dirección y teléfono. La ocultación en pantalla no impide
una lectura autorizada por la API; hay que crear una proyección previa
sin detalles sensibles y ajustar simultáneamente el cliente y las políticas
antes de limitar el acceso a la fila completa. Actualmente no hay
asignaciones `invited` activas para probar este caso con datos reales.

**P1 — Prueba E2E multidispositivo.** No se han comprobado físicamente
Android + iPad + PC al editar simultáneamente, recuperar Wi-Fi, aceptar
domicilios ni exportar los reportes. Debe validarse con cuentas sintéticas
reales y observar el control de versiones y los permisos.

**P2 — Autenticación.** Advisor Supabase advierte que la protección contra
contraseñas filtradas está desactivada. Cambiarlo requiere revisar la
configuración Auth y el procedimiento de acceso de los usuarios existentes.

**P2 — 26 funciones SECURITY DEFINER ejecutables por usuarios autenticados.**
Son advertencias de revisión, no evidencia de explotación. Las RPC nuevas
incluyen comprobación explícita de sesión/rol/permiso; las demás necesitan
revisión individual de exposición y privilegios en cambios futuros.
El advisor también identifica 10 tablas con RLS sin políticas, incluidas
las nuevas tablas privadas: esto es intencional porque no se conceden
permisos directos.

**P2 — Respaldos externos.** El checkpoint verificado reside en el mismo
proyecto Supabase. No reemplaza una copia fuera del proyecto o PITR
según la capacidad del plan.

**P3 — Rendimiento e índices.** Supabase señala 86 claves foráneas sin
índice de cobertura y 20 índices sin uso observado. Optimizar tras
`EXPLAIN ANALYZE` y métricas reales, no mediante cambios masivos.
Empresas y Reportes aún almacenan aproximadamente 285/292 KB de datos
gráficos; conviene migrar esas imágenes de forma controlada a Storage,
con referencias y control de acceso, solo después de respaldarlas.

**P3 — Normalización interna.** Las nueve tablas están físicamente
separadas por módulo, pero conservan payload JSON por workspace;
no constituyen una fila relacional por cada elemento de Jornada/Reporte.
Las entidades maestras de Pacientes, muestras y Domicilios ya tienen tablas
relacionales oficiales.

## 6. Criterio de cierre
La **migración física modular está aplicada y verificada en servidor y CI**.
La retirada definitiva del JSON heredado y la certificación de todos los
flujos en hardware real continúan pendientes. No se promete ausencia de
errores sin completar esas pruebas.

## 7. Reversibilidad
El espejo sigue actualizado dentro de la misma transacción. Las versiones
anteriores conservan sus RPC. La migración no eliminó registros reales,
y se mantiene el checkpoint previo. No ejecutar restauraciones ni
limpiezas automáticas sin reconciliar revisiones más recientes.
