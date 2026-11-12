# FleboReport · Domicilios reconstruido (Variante C)

Referencia: imagen premium solicitada por el usuario.

## Estructura real rediseñada
- Encabezado con icono de domicilio clínico, ondas índigo/violeta/turquesa,
  título «Domicilios» y acciones reales («Nuevo domicilio», «Exportar CSV»).
- Pestañas Agenda, Historial, Calendario y Crear, con navegación anterior
  intacta y el botón de crear oculto a técnicos.
- Resumen de cuatro métricas reales, en fila compacta y desplazable en móvil.
- Panel de agenda con contador real y filtros alineados; tarjetas de visita
  enriquecidas con avatar, fecha/hora, urgencia, estado, flebotomista y
  acceso al seguimiento. Nunca revela nombres, teléfonos, direcciones
  ni pruebas de una invitación pendiente antes de aceptarla.
- Formulario **reorganizado físicamente** en tres fieldsets:
  Paciente, Programación, Asignación y pruebas. Los campos mantienen
  exactamente los mismos IDs para conservar búsquedas, RLS, validaciones,
  notificaciones y creación de domicilios.
- Calendario refinado con indicación de día y eventos. Historial adaptado
  a las mismas tarjetas y filtros de Agenda.
- Ventana de seguimiento **reagrupada por secciones** (pruebas,
  documentos, eventos), estados, botones y datos separados; respeta
  las acciones ya existentes, el flujo de campo y pacientes adicionales.
- Adaptación móvil, tablet/iPad, PC y pantalla reducida.

## Seguridad y regresiones
- Sin modificaciones en Supabase, datos, tablas, permisos ni lógica de guardado.
- Los botones existentes siguen invocando sus mismos handlers.
- Los elementos se reagrupan sin duplicarlos: se mueven los nodos reales,
  preservando sus valores y listeners.
- CSS limitado al módulo y a los paneles modales, importado solo para
  \`media=screen\`, sin afectar PNG/PDF.
- Precache PWA actualizado a \`v288\`.

## Verificación pendiente
La prueba de código y la integración automatizada no pueden demostrar
identidad píxel a píxel con una imagen generada. Para validar coincidencia
visual fina hay que comparar capturas reales de Inicio/Domicilios en móvil,
tablet y PC. La propuesta sirve como referencia, no como captura del
renderizador de la app.
