# FleboReport Domicilios — gestos visuales premium (v289)

Se aplican gestos de presentación para acercar el módulo al modelo original:
- **Tarjetas de visita:** entrada suave al cargar, relieve al tocar y onda táctil
  (ripple) con coordenadas reales del dedo, sin interceptar clics.
- **Pestañas:** transiciones cortas al activar Agenda, Historial, Calendario y Crear.
- **Indicadores:** aparición escalonada y distintivo visual de estado;
  pendientes/en proceso tienen un brillo muy discreto.
- **Calendario:** respuesta visual al elegir día y seleccionar una visita.
- **Ventana de detalle:** aparece como hoja inferior suave en celular y modal
  de acceso en PC; su cierre y navegación mantienen los handlers originales.
- **Campos:** resaltado de foco y contorno claro con teclado.
- **Desplazamiento:** pestañas e indicadores conservan deslizamiento táctil horizontal.
- **Accesibilidad:** desactiva animaciones cuando el dispositivo solicita movimiento
  reducido; navegación, estados clínicos, permisos y sincronización no se modifican.

La nueva capa CSS/JS no hace llamadas a Supabase ni introduce dependencias de pago.
Validación de fidelidad píxel a píxel requiere comparar capturas reales del navegador
con la imagen de referencia, no solo pruebas unitarias.
