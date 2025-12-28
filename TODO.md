# TODO: Volver a habilitar transcripciones

## 1) Recuperar las transcripciones fuente
- Localizar un backup de `site/data/transcripts.json` (antes del borrado) o
  re-ejecutar el scraper para regenerarlo.
- Verificar que el JSON tenga el mismo formato usado por `site/app.js`
  (string plano o `{ text, segments }`).

## 2) Re-generar transcripciones por programa
- Usar `scripts/split_transcripts.py` para generar `site/transcripts/<id>.js`.
- Confirmar que la salida no supere el limite de GitHub por archivo
  (ya no deberia, porque son miles de archivos pequenos).
- Considerar actualizar el script para:
  - Emitir archivos JSON en vez de JS y hacer `fetch` directo.
  - Generar un indice liviano de "tiene transcripcion" para UI/filters.

## 3) Reintegrar UI y busqueda
- Restaurar el toggle de "buscar en transcripciones".
- Volver a mostrar el boton "Ver transcripcion" en cada card con transcripcion.
- Re-activar la carga perezosa por episodio y el render con segmentos.
- Validar que el highlight/karaoke siga funcionando.

## 4) Ajustar el scraper / pipeline
- Definir un flujo reproducible (scraper -> split -> deploy).
- Agregar una tarea en el workflow para generar `site/transcripts/`
  si decidimos no commitear esa carpeta.

## 5) Deploy en GitHub Pages
- Con transcripciones ya separadas, verificar que el push no vuelva a fallar.
- Revisar que `site/` quede publicado correctamente desde Actions.
