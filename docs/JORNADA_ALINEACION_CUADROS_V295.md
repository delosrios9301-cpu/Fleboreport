# FleboReport — Jornada v295: alineación uniforme

Motivo: los cuadros del módulo Jornada aparecían desplazados hacia un lado y sus etiquetas, cifras e iconos no quedaban centrados entre la parte superior e inferior.

Corrección limitada a `jornada-premium.css`:
- cuatro indicadores con igual anchura, retícula de contenido centrada en ambos ejes, espaciado vertical simétrico e icono/número/etiqueta en columna
- tarjetas Jornada activa, Buscar paciente, Cédula, Pruebas seleccionadas y Pacientes en toma al 100% del ancho disponible, márgenes laterales idénticos y alineación vertical de iconos, texto y flechas
- campo de cédula conserva texto legible y validaciones; botón Generar reporte conserva su evento
- ajustes Android <=760px, pantallas estrechas <=370px y dimensiones de PC/tablet
- solo presentación (CSS screen); no se alteran datos, lógica, permisos ni impresión PDF
- versión nueva de estilo y service worker v295, con pruebas de regresión específicas

**Límite de verificación:** tests de CSS y CI no sustituyen inspección visual en el teléfono real. Comparar captura después de publicar.
