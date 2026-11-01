# Guía de FleboReport

## Instalar en el teléfono

Abre [FleboReport](https://delosrios9301-cpu.github.io/Fleboreport/) desde el navegador:

- **Android / Chrome:** menú ⋮ → Instalar app o Añadir a pantalla de inicio.
- **iPhone o iPad / Safari:** Compartir → Añadir a pantalla de inicio.

## Uso principal

1. Configura el laboratorio y el catálogo.
2. Registra empresa, jornada, fecha, horario y responsable.
3. Agrega pacientes y sus pruebas.
4. Revisa el conteo y selecciona infografía o formato formal.
5. Descarga PNG o imprime como PDF. El reporte de jornada no incluye nombres ni cédulas.

## Estudios clínicos

Configura protocolos, visitas, muestras, estados y ubicaciones. En recepción se registra el código de sujeto y el horario de toma/recepción. La bandeja permite buscar y filtrar; el procesamiento registra alícuotas principal y backup. Escanea cada criovial y registra almacenamiento temporal o definitivo. Las posiciones ocupadas y libres se muestran por caja.

## Guardar y proteger los datos

La app instalada y el sitio web guardan los datos en el navegador de cada dispositivo. No se sincronizan entre dispositivos. Usa **Configuración → Datos locales → Descargar respaldo completo** para exportar y **Restaurar respaldo** para recuperar un JSON. El archivo no está cifrado; conserva acceso privado.

## Estado de conexión a nube

El esquema Supabase se prepara en `supabase/migrations`, pero el cliente web aún debe conectarse a un proyecto y configurar autenticación. Hasta entonces, la aplicación permanece en modo local. Nunca introduzcas una clave secreta de servidor en GitHub Pages.
