import json
from pathlib import Path

SRC = Path("site/data/transcripts.json")
DEST_DIR = Path("site/transcripts")


def main() -> None:
  if not SRC.exists():
    if not SRC.exists():
        raise SystemExit(f"No existe {SRC}")

    DEST_DIR.mkdir(parents=True, exist_ok=True)

    with SRC.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    for post_id, payload in data.items():
        out_path = DEST_DIR / f"{post_id}.js"
        with out_path.open("w", encoding="utf-8") as out:
            out.write("window.__vdpTranscripts = window.__vdpTranscripts || {};\n")
            out.write(
                f"window.__vdpTranscripts[{json.dumps(post_id)}] = "
                f"{json.dumps(payload, ensure_ascii=False)};\n"
            )

    print(f"Generados {len(data)} archivos en {DEST_DIR}")


if __name__ == "__main__":
    main()
