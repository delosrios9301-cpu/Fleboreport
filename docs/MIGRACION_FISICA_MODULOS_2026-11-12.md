# FleboReport: extracción física de estado a módulos

Se separa el contenido legado en **nueve tablas físicas privadas**, cada
una con su revisión, fecha, workspace y payload propio. Los módulos son
Pacientes, Jornada, Empresas, Reportes, Catálogo, Atenciones, Clínica heredada,
Configuración y Extras (para claves futuras desconocidas).

Las tablas \`public.patients\`, \`public.clinical_samples\`, \`public.home_visits\`
y otras entidades ya existentes continúan como fuentes relacionales oficiales.
Se mantienen las nueve tablas nuevas dentro del esquema privado, con RLS
habilitado y sin permisos de lectura directa para los roles web.

El trigger de compatibilidad copia toda inserción, actualización o borrado
del antiguo \`workspace_shared_app_state\` a la tabla física del módulo
**dentro de la misma transacción**. El backfill solo lee la fuente existente
y escribe en las nuevas tablas, sin borrar expedientes, muestras ni informes.

IMPORTANTE: Esto completa la **extracción y duplicación física inicial**.
El JSON legado aún existe por compatibilidad con versiones antiguas.
No debe eliminarse hasta migrar todos los lectores/escritores, los procesos de
reinicio, y validar el funcionamiento simultáneo entre dispositivos.
