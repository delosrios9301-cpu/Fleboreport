# FleboReport Domicilios: causa real del botón rectangular (v293)

La hoja CSS v292 definía la cápsula mediante `.hv-ref-new`, pero el botón real `id="hvRefNew"` no llevaba esa clase. Aunque se publicaba el CSS, ese selector no encontraba el botón; por eso el usuario seguía viendo un rectángulo.

Corrección: asignar `class="hv-ref-new"` directamente al único botón de creación y aplicar una regla por ID para prevalecer sobre estilos anteriores. Se mantienen las mismas dimensiones, contorno lila, sombra, degradado y respuesta táctil de las cápsulas Pendientes/Aceptados. No se modifican permisos, formularios, ni funciones clínicas. Nuevas pruebas verifican de manera explícita que la clase *existe en el HTML que genera JavaScript*, en vez de comprobar únicamente que aparecía en el CSS.

Forzar recarga con archivos JavaScript y CSS `reference3` y Service Worker `v293`. La diferencia visual debe verificarse en una nueva captura de teléfono después de actualizar.
