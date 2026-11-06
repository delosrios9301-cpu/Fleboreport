# Módulo de domicilios · FleboReport

El módulo de domicilios utiliza Supabase Auth, tablas operativas del espacio de trabajo y Supabase Realtime. El acceso se realiza con nombre de usuario y contraseña mediante la Edge Function `flebo-username-auth`.

## Flujo operativo

- Agenda crea uno o varios domicilios, define fecha, hora y prioridad, selecciona pruebas del catálogo y asigna al flebotomista.
- La persona asignada recibe una notificación interna/Push y debe aceptar o rechazar la invitación.
- La información sensible del paciente y la dirección se limita según el estado de la asignación y las políticas de acceso.
- Después de aceptar, el flebotomista asignado puede actualizar el avance: en camino, en domicilio, muestras tomadas o incidencias.
- Agenda puede cancelar antes de que comience la ejecución; la cancelación requiere motivo y genera trazabilidad y notificación.
- Cada prueba conserva su estado. Si una prueba no se toma, se exige una observación.
- Las pruebas adicionales se seleccionan desde el catálogo activo y conservan una copia de los requisitos del catálogo.
- El historial permite consultar detalles y buscar por nombre, cédula o fecha.

## Seguridad y datos

La visibilidad y las operaciones no dependen únicamente de ocultar botones. RLS, funciones protegidas y triggers en PostgreSQL controlan el acceso al espacio de trabajo y las acciones del usuario asignado.

No relajes las políticas para resolver errores de permisos sin identificar primero la operación, el usuario, la asignación vigente y el permiso requerido. Las funciones privilegiadas deben comprobar `auth.uid()`, membresía, asignación y autorización antes de modificar registros.

## Notificaciones

El flujo actual utiliza notificaciones dentro de la aplicación y Push cuando el navegador/dispositivo lo admite y el usuario ha activado el permiso. Algunos dispositivos o versiones antiguas pueden no admitir Push; en esos casos, el usuario debe consultar el centro de notificaciones al abrir FleboReport.

La función `domicilios-whatsapp-webhook` es una integración opcional. No debe asumirse que WhatsApp está configurado como canal de entrega ni que se requiere contratar una API para operar el flujo actual.

## Migraciones y despliegue

El proyecto Supabase ya tiene migraciones aplicadas. La lista antigua de cinco migraciones que aparece en documentación histórica no es una guía válida para reconstruir el estado actual.

Las migraciones remotas y las fuentes versionadas están conciliadas: el directorio activo contiene las 81 entradas del registro de Supabase, con coincidencia exacta de versión y nombre. Los archivos anteriores se preservaron en `migration_archive/current-main/`. La recuperación fue solo de archivos; no se aplicó SQL ni se modificó producción. Antes de aplicar una nueva migración de domicilios, valida `supabase migration list` y revisa [SETUP.md](SETUP.md).

Las Edge Functions se despliegan por separado de GitHub Pages. Publicar el frontend no actualiza automáticamente la lógica de notificaciones o autenticación del servidor.

## Pruebas necesarias

Usa cuentas de prueba y datos ficticios para verificar:
- Agenda y coordinador pueden consultar y administrar los domicilios que les corresponden.
- Cada flebotomista ve y responde solo a su asignación vigente.
- Una reasignación invalida el acceso del asignado anterior.
- No se muestran datos sensibles antes de la aceptación.
- Cancelación, rechazo, incidencias y cambios de estado generan trazabilidad y notificaciones correctas.
- Las pruebas adicionales solo provienen del catálogo permitido.
- Historial, búsqueda, filtros, sincronización y reconexión funcionan sin duplicar registros.

No uses datos reales para pruebas destructivas ni borres eventos de auditoría.
