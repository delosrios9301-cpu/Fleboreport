# TALCSYS Lab — integración en rama de pruebas

Estado: preparación de integración, NO publicada.

## Fuente visual obligatoria
Usar únicamente la **segunda propuesta (fila central)** del archivo original `Propuestas de logo TALCSYS Lab.png`, con monograma T, órbita y tres nodos. No utilizar ilustraciones generadas mediante búsquedas ni reinterpretaciones del símbolo. El icono de 512 px preferido debe derivarse visualmente de esa fuente y validarse antes de sustituir iconos de la app.

## Aislamiento
- Rama: `feature/talcsys-lab-identidad-pruebas`.
- No editar `main`, `manifest.webmanifest`, `service-worker.js`, `native/android/ic_stat_fleboreport.xml` ni `native/android/configure_android.py` hasta que se hayan validado los recursos correctos.
- No modificar autenticación, roles, datos clínicos, notificaciones ni lectores de cédula.
- No publicar GitHub Pages ni APK desde esta rama.
- Revisar encabezado, pantalla de acceso, navegación y PWA en Android, iPad y PC antes de cualquier integración.

## Próximas acciones
1. Extraer sin reinterpretación el logotipo central del archivo fuente.
2. Preparar versiones horizontal y cuadrada; confirmar fidelidad con el usuario.
3. Añadir recursos a un directorio nuevo aislado de la app y realizar revisión visual.
4. Integrar solo después de comprobar compatibilidad y de la aprobación del logotipo.
