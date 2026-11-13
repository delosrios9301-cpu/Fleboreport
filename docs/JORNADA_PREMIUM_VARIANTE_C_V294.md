# FleboReport — Jornada Premium Variante C (v294)
**Fecha:** 12 noviembre 2026

## Referencia y corrección
La primera imagen del usuario muestra una pantalla operativa con cuatro KPI
brillantes, una jornada activa horizontal, acceso a búsqueda, cédula,
pruebas, pacientes en toma y un botón amplio para generar reporte.
La pantalla publicada anterior priorizaba una tarjeta «Jornada actual»
muy alta y un formulario que desplazaba todo el trabajo hacia abajo.

## Implementación de la estructura real
- Encabezado ligero «Jornada · Registro y toma de pruebas» bajo el título
  global fijo. Se oculta solo en Jornada el segundo encabezado contextual
  duplicado.
- Cuatro KPI con números y datos reales: Pacientes, Pruebas, Completados
  y **En toma** (pacientes que tienen al menos una prueba sin marcar tomada).
- Tarjeta «Jornada activa» con estado y **fecha real** de la sesión;
  no se inventa un número secuencial J-0125.
- Tarjetas activas Buscar paciente, Cédula / identificación,
  Pruebas seleccionadas y Pacientes en toma, con fondo pastel,
  contornos redondeados, degradados y ondas inferiores.
- El campo real \`journeyPatientId\` se mueve a la tarjeta visible, sin
  duplicarlo: se conservan su ID, listeners y guardado del borrador.
- El botón real **Generar reporte** se reubica al final del panel
  compacto y sigue invocando \`openJourneyReportSetup()\`. El formulario
  de empresa/responsable/horario, PNG/PDF y limpieza posterior no se alteran.
- Registro completo y lista de muestras aparecen al seleccionar la
  tarjeta correspondiente. Se puede cerrarlos desde «Cerrar detalles».
- «Nueva jornada» y «Ver resumen» permanecen en «Opciones de jornada».
- Indicadores secundarios y números se alinean con fuentes y tamaños
  legibles. Móvil, tablet y PC mantienen el diseño de Variante C.

## Salvaguardas
- Sin modificación de RLS, Supabase, cuentas, sincronización ni servicios de pago.
- No cambia ninguna función de registro, deduplicación, toma de muestras
  ni exportación.
- CSS solo para pantalla; el documento PNG/PDF no recibe estas reglas.
- Cache PWA actualizado a v294 con los nuevos archivos incluidos.

## Verificación
Ejecutar pruebas automatizadas, PostgreSQL y Android CI; revisar
publicación GitHub Pages. La fidelidad pixel-perfect aún necesita
comparación con capturas reales en Android, iPad y PC.
