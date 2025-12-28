# Venganzas del Pasado - mobile-friendly

Este repo contiene:

- `scripts/scrape_vdp.py`: scraper incremental con salida JSON.
- `site/`: sitio estatico liviano para busqueda y reproduccion.

## Scraping

Generar el indice basico (titulo/fecha/mp3/url):

```
uv run scripts/scrape_vdp.py --out site/data
```

Generar tambien las transcripciones (mas pesado):

```
uv run scripts/scrape_vdp.py --out site/data --with-transcripts
```

Para actualizar sin regenerar todo, el script reutiliza `site/data/index.json` y solo agrega nuevos posts. Si usas `--with-transcripts`, tambien completa transcripciones faltantes.

## Ejecutar el sitio en local

```
python -m http.server --directory site 8000
```

Abrir `http://localhost:8000` desde el telefono (o usando el IP local de tu maquina).

## Notas

- El audio se reproduce desde la URL original (no descarga).
- El modo "Incluir transcripciones" carga `site/data/transcripts.json` si existe.
- Para bajar el consumo de datos, manten desactivada la busqueda por transcripcion.
