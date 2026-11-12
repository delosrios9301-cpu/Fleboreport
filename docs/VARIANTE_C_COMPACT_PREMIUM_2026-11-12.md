# FleboReport — Variante C Compact Premium (2026-11-12)

Se implementa la propuesta visual basada en la imagen seleccionada por el usuario.

## Vista de Inicio
- Encabezado índigo/violeta con gradientes, onda turquesa y logotipo de tubo + gota.
- Marca FleboReport, subtítulo “Panel clínico” y campana siempre visibles.
- Indicadores dinámicos originales en **una franja horizontal desplazable**, con
  tarjetas pequeñas, números centrados, cuatro gradientes y flechas reales.
- Cuatro tarjetas rápidas pastel en dos columnas: Jornada, Domicilios,
  Estudios y Reportes. No se han reemplazado permisos ni controladores; cada
  tarjeta pulsa la ruta original habilitada al usuario.
- Dock móvil de **cuatro** accesos: Inicio, Jornada, Domicilios y Más.
  Pacientes y los demás módulos siguen disponibles en el menú.

## Pantallas operativas
- Jornada, Pacientes, Empresas, Catálogo, Domicilios, Estudios Clínicos,
  Procesamiento, Reportes, Historial y Configuración adoptan el mismo
  lenguaje de encabezados, superficies, botones, controles y métricas.
- Indicadores secundarios compactos, con scroll horizontal en móvil.
- Mismo lenguaje visual entre móvil, tablet y PC; sin texto vertical.
- El contenido del reporte PDF/PNG, formularios, IDs y flujos de permisos
  se conservan. Ninguna mutación de Supabase ni de datos clínicos.
- La nueva capa CSS/JS se carga **después** de Clinical Modern 6.0, y
  puede retirarse sin cambiar la lógica existente.

## Validación
Ejecutar pruebas Node, integración PostgreSQL sin modificaciones clínicas
y compilación Android; verificar publicación GitHub Pages. La validación
visual píxel a píxel y gestual en dispositivos reales todavía requiere
capturas sobre Android, iPad y PC.
