# FleboReport · densidad compacta global (v287)

**Cambio visual solicitado:** reducir el espacio de los cuadros y paneles en
todos los módulos, manteniendo el aspecto de la Variante C y las funciones.

## Cambios realizados

- **Inicio:** indicadores de ~84–95 px en vez de ~105–118 px; acceso rápido
  de ~86–90 px en lugar de ~111–123 px; flechas y scroll se mantienen.
- **Jornada, Pacientes, Domicilios, Catálogo, Estudios, Procesamiento, Historial:**
  indicadores secundarios de aproximadamente 62–65 px como mínimo,
  pero con altura automática si el texto necesita más líneas.
- **Empresas, Reportes y Configuración:** menos margen entre cuadros,
  encabezados compactos, formularios y tarjetas de administración más
  estrechas; los formularios conservan el contenido y controles.
- **Tablas, listados y agenda:** espaciado vertical, padding y distancias
  entre tarjetas reducidos; listas completas, sin truncar datos clínicos.
- **Android / iPad / PC:** móviles <=760px, escritorio >=761px y columnas
  de acceso rápido en PC ancho >=980px.
- **Accesibilidad:** botones, campos de texto y controles activos conservan
  objetivos táctiles de al menos 44 px. No se agrandan checkbox, radio
  ni inputs ocultos.
- **PDF/PNG:** la nueva capa se importa solo para media "screen" y no
  altera el contenido imprimible del reporte.

## Implementación segura

Solo se agrega variant-c-density.css; no se editan scripts clínicos,
consultas SQL, sesión, permisos, estado sincronizado ni procesamiento de
muestras. Service Worker v287 precachea la hoja y se invalida el shell
anterior. Test automatizado cubre las pantallas y las garantías básicas.

## Límites de verificación

Las pruebas de código y CI validan integridad, pero la percepción de
densidad y los desbordamientos deben comprobarse en teléfonos Android,
tabletas y PC físicos. No se declara igualdad píxel a píxel sin esas capturas.
