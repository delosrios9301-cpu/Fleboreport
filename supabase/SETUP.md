# Supabase: configuración y operación de FleboReport

## Estado actual

FleboReport ya está conectado al proyecto Supabase configurado en el frontend. El proyecto está activo y utiliza:

- Supabase Auth, con inicio de sesión por nombre de usuario y contraseña mediante `flebo-username-auth`.
- Tablas por espacio de trabajo con Row Level Security (RLS).
- Estado general de aplicación por combinación de espacio de trabajo y usuario.
- Expedientes de pacientes, domicilios y registros clínicos en tablas específicas.
- Supabase Realtime y sincronización adicional para mantener actualizadas las vistas.
- Edge Functions para autenticación y notificaciones.

La URL del proyecto y la clave publicable se utilizan en el navegador. Una clave publicable no reemplaza RLS. Nunca incluyas `service_role`, claves secretas ni contraseñas en HTML, JavaScript, GitHub o archivos públicos.

## Persistencia y alcance

La tabla `workspace_app_state` separa el estado general por `workspace_id` y `user_id`; esto permite que la misma cuenta utilice distintos dispositivos sin convertir automáticamente todo ese estado en información compartida con los demás miembros.

Los expedientes de pacientes, domicilios y registros de Estudios Clínicos utilizan tablas específicas del espacio de trabajo. Sus accesos se controlan con RLS, funciones protegidas y permisos granulares. Al modificar estos flujos, verifica tanto la interfaz como las políticas y funciones de PostgreSQL.

## Edge Functions

Las funciones de Supabase se despliegan por separado de GitHub Pages. Un cambio en `supabase/functions/*` no queda publicado al desplegar el sitio estático.

Funciones del proyecto:
- `flebo-username-auth`: registro inicial, inicio de sesión y administración de usuarios autorizada.
- `domicilios-notifications`: notificaciones internas y Push para los flujos de domicilios.
- `domicilios-whatsapp-webhook`: integración opcional de webhook; su presencia no significa que la entrega por WhatsApp esté configurada.

Antes de desplegar una función, revisa sus comprobaciones de identidad, pertenencia al espacio, permisos, secretos y logs. Las credenciales privilegiadas deben permanecer exclusivamente en los secretos del entorno de Supabase.

## Estado de migraciones: atención obligatoria

En la revisión del 6 de noviembre de 2026 se observaron **81 entradas en el historial remoto** y **61 archivos SQL en el repositorio**. Hay entradas remotas sin un archivo fuente coincidente y archivos locales cuyo nombre/versión no coincide directamente con el historial remoto. También hay marcas de tiempo duplicadas entre archivos locales.

Esto no demuestra por sí solo que el esquema desplegado esté incorrecto; sí significa que el historial de migraciones no es actualmente una fuente reproducible y confiable para reconstruir el proyecto desde cero.

**No ejecutes `supabase db push`, no apliques archivos SQL en producción y no intentes reparar versiones con `migration repair` sin un inventario previo y una comparación de esquema.** Primero hay que recuperar o reconstruir las migraciones faltantes, identificar cuáles ya están representadas por otras migraciones y resolver las marcas de tiempo duplicadas sin alterar el historial remoto.

## Seguridad y validación

- Mantén RLS habilitado en todas las tablas del esquema expuesto.
- Las funciones `SECURITY DEFINER` deben validar identidad y autorización dentro de la función; no las conviertas en `SECURITY INVOKER` ni retires permisos de forma masiva sin revisar sus usos.
- Las políticas permisivas múltiples deben evaluarse junto con las políticas restrictivas. PostgreSQL combina las permisivas con OR y las restrictivas como condiciones adicionales.
- Antes de cambiar una política, función o índice, prueba el resultado con cuentas de cada rol y verifica que no se rompan agenda, aceptación de domicilios, revisión clínica, procesamiento ni auditoría.
- No borres registros de auditoría ni datos de producción como parte de una prueba.
- El asesor de seguridad de Supabase reportó desactivada la protección contra contraseñas filtradas. El administrador del proyecto debe revisar y habilitar esa protección desde la configuración de Auth.

## Publicación

GitHub Pages publica el frontend estático. Las migraciones, funciones Edge y secretos de Supabase tienen ciclos de despliegue separados. Una publicación web correcta no certifica por sí sola el estado de las funciones ni la sincronización entre dispositivos.
