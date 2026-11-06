# Sincronización incremental de Domicilios y Estudios Clínicos

## Fuente de verdad

Supabase continúa siendo la fuente de verdad. La caché local solo evita volver a descargar una instantánea completa cuando existe un cursor válido; no habilita escrituras locales ni un modo sin conexión.

## Registro de cambios

La tabla `public.sync_change_log` almacena únicamente:

- `workspace_id`: espacio de trabajo propietario.
- `entity`: `domiciles` o `clinical_samples`.
- `record_id`: UUID del domicilio o de la muestra afectada.
- `operation`: alta, modificación o eliminación.
- `seq` y `changed_at`: cursor y fecha del cambio.
- `actor_id`: usuario que originó el cambio, cuando existe sesión.

No guarda nombres, cédulas, direcciones, teléfonos, notas ni contenido clínico.

Los triggers registran también los cambios en tablas secundarias. Las modificaciones de pruebas, asignaciones, eventos, documentos y pacientes adicionales de un domicilio apuntan al domicilio principal. Los cambios en contenedores y eventos clínicos apuntan a la muestra.

## Seguridad

- RLS está habilitado en la tabla de cambios.
- Domicilios respeta el alcance de lectura de responsables y flebotomistas asignados. Un antiguo asignado solo puede consultar identificadores de cambios de visitas que tuvo asignadas, para que su dispositivo retire datos que ya no debe mostrar; no recibe el contenido de la visita.
- Estudios Clínicos respeta los roles autorizados que ya pueden leer muestras.
- La función de trigger es `SECURITY DEFINER`, usa `search_path` vacío y no es ejecutable directamente por clientes.
- El registro está publicado en Supabase Realtime para avisar a los dispositivos; el cliente vuelve a consultar con RLS antes de recibir datos.

## Flujo del cliente

1. Si no existe una instantánea local válida, descarga el estado completo permitido por RLS.
2. Captura el cursor antes de esa descarga y reproduce los cambios que ocurrieron durante la carga.
3. En sincronizaciones siguientes, consulta solo cambios posteriores al cursor.
4. Descarga los registros principales afectados y sus relaciones actuales; esto también detecta eliminaciones.
5. Avanza el cursor solo después de aplicar los cambios. La asignación de secuencias se serializa por laboratorio hasta el COMMIT para evitar saltos cuando dos transacciones concurrentes terminan en distinto orden.
6. Al recuperar conexión o volver a mostrar la aplicación, consulta los cambios que pudieron ocurrir mientras el dispositivo estuvo desconectado.

En Domicilios, la caché de arranque solo se utiliza para usuarios con permisos de lectura y gestión; vence a los cinco minutos y no se utiliza para flebotomistas. En Estudios Clínicos, el cursor se guarda junto con la instantánea clínica local, aislado por usuario, espacio y rol; nunca se publica en `workspace_app_state`.

## Reconciliación y mantenimiento

La primera carga sin caché y la caché vencida realizan una reconciliación completa. Los cursores se reinician al cambiar de usuario/espacio/rol o al restablecer los datos clínicos.

La tabla de cambios no tiene todavía una política automática de retención. No se deben borrar filas sin implementar primero un límite de retención y una detección de cursores vencidos que fuerce una reconciliación completa. Conviene revisar su crecimiento antes de programar limpieza.
