# Guía de FleboReport

## Abrir e instalar

Abre [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/) desde el navegador:

- **Android / Chrome:** menú ⋮ → Instalar app o Añadir a pantalla de inicio.
- **iPhone o iPad / Safari:** Compartir → Añadir a pantalla de inicio, si el dispositivo y la versión del sistema lo permiten.

## Acceso

Inicia sesión con tu nombre de usuario y contraseña. La opción **Recordarme** controla si la sesión se conserva después de cerrar el navegador. No compartas tus credenciales.

Los módulos y las acciones disponibles dependen del rol y de los permisos asignados por el administrador. Si no tienes autorización, el sistema debe ocultar la acción y validar el permiso también en el servidor.

## Datos y sincronización

FleboReport utiliza Supabase para autenticación y almacenamiento en la nube:

- El estado general de la aplicación se sincroniza por usuario dentro del espacio de trabajo.
- Los expedientes de pacientes, domicilios y registros clínicos usan tablas del espacio de trabajo y controles de acceso.
- Para consultar datos compartidos entre colaboradores, utiliza el módulo correspondiente; no todos los elementos del estado general de cada usuario son compartidos entre miembros.

Mantén una conexión a internet para iniciar sesión y sincronizar los cambios. Si aparece un error de conexión, no repitas varias veces una operación de escritura: primero verifica si el registro ya quedó guardado.

## Respaldo

La aplicación permite descargar y restaurar un archivo JSON desde Configuración. El archivo puede incluir información sensible; guárdalo en un lugar privado y protegido. Este respaldo de aplicación no sustituye las copias de seguridad de la base de datos.

## Estudios Clínicos

Configura protocolos, visitas, tipos de muestra y requisitos. Registra la toma y recepción, revisa las muestras y envía las aprobadas a Procesamiento. En Procesamiento se gestionan las alícuotas y los estados de almacenamiento permitidos por el flujo configurado.

## Domicilios

Agenda el domicilio, selecciona las pruebas del catálogo y asigna al flebotomista. La persona asignada debe aceptar o rechazar la invitación. Después de aceptar, puede actualizar el avance y registrar el resultado de cada prueba. Agenda puede cancelar un domicilio antes de que comience su ejecución, dejando el motivo registrado.

## Ayuda y seguridad

Si una pantalla no se actualiza, comprueba primero la conexión y vuelve a cargar la aplicación. No borres los datos del navegador ni restablezcas el espacio de trabajo como método de solución: esas acciones pueden afectar información que todavía no se haya sincronizado.
