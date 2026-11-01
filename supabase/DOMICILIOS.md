# Módulo de domicilios · FleboReport

La interfaz de agenda se integra en `index.html` y reutiliza el catálogo maestro y los pacientes locales. Mientras no se conecte un backend, los domicilios se guardan únicamente en este navegador; no hay sincronización entre dispositivos.

## Flujo local validado

- Agenda crea el domicilio, selecciona las pruebas del catálogo y registra el responsable.
- El seguimiento incluye aceptación, desplazamiento, llegada, toma y finalización.
- Se contemplan las incidencias **Paciente ausente**, **Paciente rechazó la toma** y **No realizado**, todas con motivo obligatorio.
- Cada prueba tiene su propio estado. Si una prueba queda como **No tomada**, se exige una observación y queda registrada en el historial y en el CSV.
- No se permite finalizar el domicilio si quedan pruebas pendientes o si no hay ninguna prueba tomada.
- Las pruebas adicionales se seleccionan desde el catálogo; sus requisitos se guardan como snapshot para conservar la configuración original.

## Esquema de Supabase

Aplicar en este orden, cuando se haya identificado y activado el proyecto destinado exclusivamente a FleboReport:

1. `20261101000000_initial_schema.sql`
2. `20261102000000_home_visits.sql`
3. `20261103000000_home_visits_security_snapshots.sql`

La tercera migración refuerza RLS para que agenda pueda consultar todos los domicilios del espacio de trabajo y el flebotomista únicamente sus asignaciones. También protege los datos originales de la visita y de las pruebas, registra el actor de los eventos desde la sesión autenticada y conserva los snapshots del catálogo. Un técnico solo puede añadir pruebas adicionales que estén en el catálogo activo y que correspondan a un domicilio asignado y aceptado.

Antes de usar datos reales hay que conectar Auth, vincular cada profesional con su usuario autenticado, crear el espacio de trabajo y probar las políticas con cuentas separadas de agenda y flebotomista. No basta con ocultar registros en la interfaz: RLS y los triggers aplican la restricción en la base de datos.

## WhatsApp

WhatsApp automático todavía no está activo. Se requiere Meta Business, WhatsApp Cloud API, número habilitado, token, Phone Number ID y una plantilla aprobada. Las credenciales deben almacenarse como secretos de Supabase Edge Functions, nunca en HTML/JS, en GitHub o en el navegador.

## Validación antes de producción

Probar con cuentas ficticias y dos flebotomistas distintos: visibilidad aislada, aceptación/rechazo, actualización de estados, incidencias, notas por prueba, pruebas adicionales del catálogo, historial inmutable, CSV, reconexión y sincronización. No usar expedientes reales hasta completar autenticación, sincronización, respaldo y pruebas de seguridad.
