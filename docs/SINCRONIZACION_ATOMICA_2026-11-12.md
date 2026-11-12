# FleboReport — escrituras parciales atómicas y protección de datos (etapa 3)

## Objetivo
Evitar subir el estado completo (aprox. 596 KiB) cuando solo se actualiza
Jornada, un catálogo, una empresa o el historial de reportes.

## Implementación
- RPC \`save_workspace_shared_app_state_patch(workspace,patch,expected_revision)\`:
  actualiza **exclusivamente las claves JSON presentes** en \`patch\`.
  Conserva el control de versiones CAS, la validación original de permisos,
  la prohibición de retirar pacientes sin \`patients.delete\`, y \`reset_epoch\`.
- El navegador compara cada sección del estado con la última instantánea
  confirmada del servidor. Si solo cambia Jornada, no reenvía imágenes de
  empresa o logotipos de reportes. Si faltan datos de referencia (primera
  sesión, otra cuenta), conserva el camino completo anterior.
- Los conflictos entre dos cuentas rechazan la revisión obsoleta. El cliente
  recupera el último estado y vuelve a combinar sin eliminar secciones ajenas.
- Una escritura idéntica devuelve éxito sin incrementar la revisión.
- Consulta periódica y Realtime de Pacientes, Estudios Clínicos y Domicilios
  de v282 permanecen funcionando.

## Garantías y límites
- Este cambio **no divide físicamente las tablas** ni elimina el estado heredado.
  El JSON compartido sigue siendo una sola fila: se reduce tráfico de subida
  y el riesgo de pisar secciones no editadas, mientras se preserva compatibilidad.
- Se necesita verificación física Android/iPad/PC para certificar latencia,
  sesiones suspendidas y recuperación de conexión.
- No se reemplaza el backup privado y no se usan datos de pacientes en tests.
- El algoritmo de unión heredado conserva sus reglas de deduplicación; la
  migración definitiva por módulo requiere migrar consumidores gradualmente.
