# FleboReport — cápsula premium para «Nuevo domicilio» (v292)

El usuario mostró una captura real en la que «＋ Nuevo domicilio» aparecía
como un rectángulo con borde rígido, diferente de «Pendientes» y «Aceptados».

Se ha igualado el estilo de **un único botón de creación** y el de
«Filtros y opciones» a la cápsula usada en dichos filtros:
- Radio completo de 999 px, contorno lila #d9d0f4, fondo blanco/lila
  degradado, texto violeta y sombra interior suave.
- Altura táctil mínima de 44 px, texto centrado y efecto de presión.
- Espaciado adaptado a teléfonos estrechos y accesibilidad del foco.
- Respeto de movimiento reducido.
- Se conservan el identificador hvRefNew, la regla de permisos existente
  y el flujo original setTab('create'). No aparecen botones nuevos.
- Sin cambios de SQL, visitas, permisos, estado, reportes o notificaciones.
- Nuevo cache-busting CSS y precaché FleboReport v292.

Validar visualmente en Android con una nueva captura; los tests de fuente
no garantizan identidad de píxeles en todos los navegadores.
