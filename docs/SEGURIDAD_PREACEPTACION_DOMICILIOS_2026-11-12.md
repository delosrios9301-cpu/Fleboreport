# Hallazgo P1 — privacidad de domicilios antes de aceptación

Se separa la invitación de la ficha de domicilio.

- RPC \`list_home_visit_invitation_previews\` entrega solo identidad técnica
  de la invitación, fecha, hora y prioridad al usuario asignado.
- Política restrictiva SELECT en \`home_visits\` exige asignación actual
  **aceptada** o autorización de gestión de coordinación para acceder a
  dirección, teléfono, notas y relaciones clínicas.
- El cliente muestra la invitación sin consultar los detalles y, al aceptar
  mediante la actualización autorizada de \`home_visit_assignments\`, hace
  una lectura completa nueva.
- No se alteran pacientes ni visitas; las demás tablas relacionadas ya
  disponen de lecturas restrictivas de asignación aceptada.
- Se conserva la invitación sin caché persistente del flebotomista.

**Despliegue seguro:** instalar primero RPC de vista previa, publicar web/APK
con cliente compatible y, finalmente, activar la política restrictiva.
Los APK antiguos deben actualizarse para poder responder invitaciones nuevas.
