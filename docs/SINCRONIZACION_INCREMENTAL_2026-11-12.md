# FleboReport — sincronización incremental, etapa 2 (2026-11-12)

## Qué cambió
1. **Pacientes**: canal Supabase Realtime sobre cambios de la tabla \`patients\`; no se procesa el contenido del evento, solo se programa una lectura con RLS. La actualización se aplaza durante escrituras activas y recupera los avisos recibidos mientras se procesaban cambios. Sigue habiendo consulta de recuperación cada 40 s, al recuperar Internet y al volver a primer plano.
2. **Muestras clínicas**: Realtime + outbox siguen como fuente de deltas. Se reemplazó la descarga completa *cada 20 segundos* por lectura incremental; comprobación completa cada 4 minutos y catálogo/configuración cada 2 minutos, solo cuando la sesión y los formularios estén disponibles. El primer inicio y el refresco manual siguen haciendo descargas completas.
3. **Domicilios**: conserva suscripciones Realtime, caché limitada por permisos y outbox con cursor. Se añade un sondeo incremental de respaldo cada 60 s cuando la aplicación está activa para recuperar eventos perdidos en el dispositivo.
4. **Versionado**: Service Worker \`v282\`, recursos JS versionados en HTML para facilitar renovación de PWA sin borrar datos.

## Salvaguardas
- No se han alterado pacientes, muestras, asignaciones ni permisos en Supabase.
- No se crea ningún servicio de pago ni tabla nueva.
- El estado general mantiene su versión de CAS, los controles por cédula y el checkpoint privado existente.
- Realtime es una notificación, no una vía de lectura al margen de RLS.
- El mecanismo incremental requiere sesión autenticada; falla hacia consultas periódicas cuando no hay eventos.
- En dispositivos antiguos y modos de ahorro de energía el sistema operativo puede suspender sesiones en segundo plano; **no se promete 120 FPS ni entrega instantánea durante esa suspensión**.

## Pruebas que faltan para cierre de sincronización total
- Dos sesiones de usuarios distintos con datos sintéticos, en teléfono/tablet/PC.
- Pérdida de conectividad durante modificación simultánea de Jornada/Reporte.
- Validación completa de flujos de domicilios con aceptación/rechazo y notificación.
- Partir gradualmente el JSON general en ámbitos transaccionales por módulo, con comparación de versiones, sin reintroducir registros eliminados.
- Validar en hardware real y revisar latencia / tasa de errores bajo carga.

La etapa 2 reduce tráfico innecesario y mejora propagación; **no equivale aún a una migración modular completa**.
