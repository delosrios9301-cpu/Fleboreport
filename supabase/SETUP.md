# Preparar Supabase

Esta carpeta contiene una migración inicial. La app aún requiere la URL y la clave pública del proyecto para autenticarse y sincronizar.

## Requisitos

1. Crear un proyecto Supabase y escoger la región apropiada.
2. Crear/invitar la primera cuenta desde Authentication.
3. Tener Node.js y la CLI de Supabase.
4. Descargar un respaldo JSON en FleboReport antes de migrar datos locales.

## Aplicar el esquema

Desde la raíz del repositorio:

```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

Aplica cambios remotos mediante migraciones versionadas, no editando el esquema sin actualizar el historial.

## Primer espacio y roles

Tras conectar el cliente autenticado, la cuenta administradora ejecuta `create_workspace('Nombre del laboratorio')`. Invita a los demás usuarios desde Authentication y asigna su rol en `workspace_members`.

Roles: `admin`, `clinician`, `technician`, `reception`, `viewer`. RLS restringe la información al espacio de trabajo y las operaciones según el rol.

## Claves del cliente

En **Project Settings → API** copia solo el **Project URL** y la **Publishable key** (o la clave pública `anon` heredada). Nunca pongas la clave `service_role` en el HTML, en GitHub Actions o en un navegador. Una clave pública no protege tablas por sí sola: las políticas RLS deben permanecer habilitadas y verificarse.

La migración no importa automáticamente el respaldo JSON. Antes del uso compartido falta terminar el cliente web, probar roles con cuentas diferentes y verificar la migración de datos.

## Incluido en el esquema

Empresas, jornadas, pacientes, atenciones, profesionales, servicios/paquetes, pruebas, evidencias, firmas, reportes, facturas, pagos, inventario, citas, recordatorios, auditoría, estudios clínicos, muestras, historia, congeladores, gavetas, racks, bandejas, cajas y crioviales. Los congeladores se crean con cuatro gavetas; los racks generan cinco bandejas; cada bandeja tiene cuatro posiciones de caja.

Las notificaciones de correo/WhatsApp, sensores físicos y sincronización del navegador necesitan su configuración adicional. El esquema registra operaciones, pero no envía mensajes ni obtiene lecturas de sensores.
