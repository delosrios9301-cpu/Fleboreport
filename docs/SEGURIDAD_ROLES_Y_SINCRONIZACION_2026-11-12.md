# FleboReport — control de permisos, sincronización e integridad

## Controles aplicados el 12 de noviembre de 2026
- Instantánea privada de recuperación íntegra, protegida del API de aplicación.
- Visor de solo lectura: su descarga de estado solo contiene datos para los reportes autorizados. La interfaz descarta cachés locales anteriores del rol visor antes de sincronizar.
- Escritura del estado compartido: se prohíbe retirar identidades de pacientes cuando el rol no tiene \`patients.delete\`. La comparación usa cédula normalizada, ID o igualdad de registro. Se conserva CAS por revisión para cambios simultáneos.
- Lectura de expedientes: un técnico sin privilegios administrativos solo obtiene pacientes de domicilios cuyo último asignado sea él y haya aceptado.
- Tablas clínicas: el rol técnico precisa permiso de lectura \`studies.view\` o \`processing.view\`. Los roles adicionales personalizados se respetan.
- Índices dirigidos a vínculos de pacientes y asignaciones, sin creación masiva de índices.
- \`clinical-cloud-sync.js\` evita consultas clínicas en cuentas sin permiso de lectura.

## Resultados verificados en producción (sin cambios de pacientes)
- Pacientes totales: 23; muestras: 25; domicilios: 39; asignaciones: 39.
- Simulación autenticada flebotomista: 1 paciente visible tras la regla. Admin/Coordinación: 23.
- Una cuenta de flebotomista tiene además un rol profesional personalizado con permisos clínicos de consulta; se conservan sus 25 muestras visibles conforme a esos permisos.
- Punto de recuperación: 2.4 MB, checksum válido; acceso directo a los roles \`anon\`, \`authenticated\` y \`service_role\` denegado.
- CI: pruebas Node y SQL sintéticas de roles, concurrencia, visor, guard de pacientes y RLS, con PostgreSQL 17 aislado.

## Riesgos no resueltos automáticamente
1. **Invitaciones pendientes de domicilio**: la lectura de \`home_visits\` incluye columnas sensibles mientras la asignación está invitada; la interfaz las oculta, pero la seguridad debe hacerse en el servidor. Requiere una nueva vista/RPC de preaceptación y migración coordinada de \`domicilios.js\` + RLS; endurecerla ahora sin adaptar el cliente impediría aceptar o rechazar asignaciones.
2. **Estado compartido heredado**: Administrador/Coordinador y otros roles operativos aún sincronizan un JSON común, aprox. 610 KB, que contiene datos de varios módulos. La solución definitiva requiere escritura parcial por módulo y lecturas proyectadas a roles con CAS y migración gradual, con pruebas de dos dispositivos.
3. **Backup externo**: el checkpoint es interno a la misma base; activar/validar backup externo o PITR mediante la infraestructura de Supabase/plan compatible.
4. **Pruebas de hardware**: sin acceso a dispositivo Android, iPad ni sesión de prueba de usuarios, no se han ejecutado pruebas E2E reales de notificaciones, PDF/PNG y flujos clínicos completos.
5. **Auth**: habilitar desde Supabase la comprobación de contraseñas filtradas y revisar contraseñas/sesiones.

No destruir ni restaurar datos en producción sin una comprobación de integridad y autorización explícita. Las migraciones aplicadas son agregados restrictivos que pueden revertirse sin modificar filas clínicas.
