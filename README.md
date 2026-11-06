# JBLR · Sistema de información

Repositorio de trabajo del Jardín Botánico de La Rioja.

## Árbol etnobotánico · Versión web independiente

- **Archivo principal:** [docs/index.html](docs/index.html)
- **Estado del código:** guardado en `main`. El archivo HTML autónomo no depende de Lovable, de paquetes ni de compilaciones.
- **Rama acuosa:** ampliada por medios, técnicas, productos y denominaciones según aplicación. Incluye inmersión, circulación del líquido, vapor con recuperación del condensado, vapor de aplicación directa y transformaciones relacionadas.
- **Otras familias:** migradas desde el atlas original como referencias iniciales (oleoso, alcohólico, glicerinado, ácido, mecánico y mixtos). Revisar y ampliar progresivamente sus denominaciones sin duplicar métodos.
- **Interfaz:** árbol horizontal con nodos expandibles, búsqueda, zoom, selección de familia, detalles, fuentes e impresión A3.
- **Edición:** las mejoras se aplican en este repositorio mediante GitHub conectado a ChatGPT. No es necesario volver a editar el proyecto Lovable.

### Activación inicial de la web pública

El sitio requiere habilitar una sola vez **GitHub Pages** en este repositorio. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/docs` → Save**.

Consulta la dirección del sitio en la misma pantalla de Pages cuando la publicación finalice. **No dar por publicada la web solo porque exista el archivo.**

### Criterios de contenido

La clasificación es descriptiva, técnico-etnobotánica y cultural: **medio/factores → técnica → producto → aplicación/denominación**. No contiene recetas ni es una guía de ejecución. Los rangos de temperatura y tiempo son referencias aproximadas, no límites universales.

El proyecto original de Lovable se conserva sin modificar: https://lovable.dev/projects/eb85b8a9-5f55-4767-81d3-d522f0e6d662

Revisión estructural 2026-11-06: código HTML/JS parseable, 146 nodos de todas las familias enlazados, sin IDs duplicados ni padres inexistentes. Validación visual en navegador y despliegue público pendientes.
