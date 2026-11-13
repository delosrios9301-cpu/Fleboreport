# Corrección de fidelidad Domicilios — referencia v290

## Hallazgo original (captura real versus imagen escogida)
La vista real dedicaba casi todo el primer pantallazo al encabezado morado del
módulo, pestañas, cuatro indicadores verticales y filtros. La referencia pedía
el nombre Domicilios bajo el encabezado global, tres cápsulas de estados y
tarjetas de visitas con bordes destacados y acciones. Era un problema de
jerarquía visual, no solo de color.

## Modificaciones
- Se mantiene el encabezado global fijo de FleboReport. Se reemplaza la
  cabecera morada interna de Domicilios por un encabezado blanco compacto con
  icono de casa turquesa, nombre y subtítulo.
- Los filtros de estado son tres cápsulas de **datos reales**: Pendientes,
  Aceptados y En camino. Tocar una filtra; volver a tocar la misma restaura
  todas las visitas activas. No hay cantidades de demostración.
- Agenda organizada directamente bajo las cápsulas: tarjetas blancas,
  bordes violetas/turquesa, barra lateral brillante, onda inferior,
  avatar, prueba real, fecha/hora, ubicación autorizada, estado en pastilla.
- Dos botones: «Ver ruta» abre voluntariamente Google Maps (sin API pagada)
  **solo si hay dirección autorizada**; «Responder» para invitaciones abre
  el flujo original de aceptar/rechazar. El resto abre seguimiento sin
  conferir permisos de gestión.
- El bloque grande de KPI, el menú de secciones, búsqueda avanzada, fecha,
  estado y exportación permanecen accesibles desde «Filtros y opciones».
  Historial, Calendario y Crear siguen usando las mismas funciones.
- El botón «Nuevo» solo se muestra a roles de coordinación, según los
  permisos existentes.
- No se modifican esquemas, datos de pacientes, RLS, funciones Supabase,
  módulo Jornada, caché de historial ni procesos de muestras.
- Se mantiene animación de entrada, respuesta táctil, estados resaltados
  y reducción de movimiento. Estilos nuevos solo para media=screen,
  preservando PDF/PNG.
- PWA v290 fuerza la nueva versión de los activos.

## Criterio de cierre
Las pruebas automáticas pueden confirmar estructura, acceso a funciones,
seguridad de la invitación y despliegue, pero no igualdad absoluta con un
mockup fotográfico. Debe hacerse comparación posterior con captura real
del Android del usuario. La interfaz debe mostrar datos auténticos,
no copiar nombres/cifras inventados de las imágenes de ejemplo.
