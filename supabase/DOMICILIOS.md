# Módulo de domicilios · FleboReport

La interfaz de agenda se integra en index.html y reutiliza el catálogo y pacientes locales. Esta primera fase almacena los domicilios en el navegador: no sincroniza entre dispositivos.

La migración 20261102000000_home_visits.sql prepara las tablas multiusuario y las políticas RLS para Supabase. Primero aplicar 20261101000000_initial_schema.sql y luego esta migración. Después, vincular professionals.user_id con el usuario autenticado, crear el workspace y agregar usuarios a workspace_members.

WhatsApp automático NO está activo. Se requiere Meta Business, WhatsApp Cloud API, número habilitado, token, Phone Number ID y plantilla aprobada. Las credenciales deben almacenarse en Supabase Edge Function Secrets, nunca en HTML/JS o GitHub.

Validar con datos ficticios: crear visitas hoy y futuras, múltiples domicilios, filtros, aceptación/rechazo, cambios de estado, pruebas adicionales, muestras tomadas/no tomadas, historial y CSV. No usar datos reales hasta activar autenticación y sincronización segura.