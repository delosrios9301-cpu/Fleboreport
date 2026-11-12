# Punto de recuperación de FleboReport — auditoría 12/11/2026

Este procedimiento mantiene la base operativa intacta. La migración
\`20261112170000_private_integrity_checkpoint.sql\` crea una instantánea **dentro de la
misma base de datos**, bajo el esquema privado, con acceso denegado a
\`anon\`, \`authenticated\` y \`service_role\`. Contiene información clínica sensible;
**nunca exportar a GitHub ni incluir los datos en logs**.

## Qué se conserva
- Estado compartido con su revisión, estado local heredado por usuario.
- Pacientes, empresas, jornadas, atenciones, reportes.
- Domicilios, asignaciones, pruebas y eventos.
- Estudios, tipos de muestras, muestras y eventos.
- Miembros, roles y permisos.
- Resumen de cantidad de eventos de auditoría (sin duplicar el historial inmutable).

El \`checksum_md5\` solo detecta alteraciones accidentales de la instantánea;
no es una firma de autenticidad. **No es una copia fuera del proyecto ni protege
contra fallos de infraestructura**: usar una copia externa de Supabase cuando esté
disponible en el plan.

## Comprobación segura, solo SQL administrativo
\`\`\`sql
select captured_at,source_revision,
       (md5(snapshot::text)=checksum_md5) as integridad_ok,
       summary->>'patients' as pacientes,
       summary->>'clinical_samples' as muestras,
       summary->>'home_visits' as domicilios
from private.fleboreport_integrity_checkpoints
order by captured_at desc limit 3;
\`\`\`

## Recuperación
Nunca ejecutar una restauración completa automáticamente.
1. Detener las escrituras y diagnosticar la causa.
2. Seleccionar la instantánea válida por hora, revisión y checksum.
3. Comparar cada tabla afectada y sus claves únicas con el estado actual.
4. Restaurar exclusivamente las filas verificadas, **en una transacción**
   y en el orden de claves foráneas; comprobar las referencias y hacer \`ROLLBACK\`
   ante cualquier discrepancia.
5. Validar la bitácora, la sincronización y los roles antes de confirmar.

No usar esta instantánea para sobrescribir trabajo más reciente sin
comparación o autorización explícita. No contiene una copia completa de
todos los sistemas externos, archivos de Supabase Storage ni Auth.
