#!/usr/bin/env python3
# /// script
# dependencies = [
#   "requests>=2.31.0",
#   "beautifulsoup4>=4.12.0",
#   "rich>=13.7.0",
# ]
# ///

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)

BASE_URL = "https://venganzasdelpasado.com.ar"
YEAR_LINK_RE = re.compile(r"/posts/(\d{4})$")
MONTH_LINK_RE = re.compile(r"/posts/(\d{4})/(\d{1,2})$")
DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
MP3_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
TIME_LABEL_RE = re.compile(r"^(\d{1,2}:)?\d{1,2}:\d{2}$")


def fetch_html(
    session: requests.Session,
    url: str,
    turbo_stream: bool = False,
    retries: int = 3,
    timeout: int = 30,
) -> str:
    headers = {}
    if turbo_stream:
        headers["Accept"] = "text/vnd.turbo-stream.html"
    last_error: Optional[Exception] = None
    for attempt in range(retries):
        try:
            response = session.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(0.5 + attempt * 0.75)
    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to fetch {url}")


def normalize_whitespace(text: str) -> str:
    return " ".join(text.split())


def parse_years_arg(value: str) -> List[int]:
    years: List[int] = []
    seen = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_raw, end_raw = part.split("-", 1)
            start = int(start_raw)
            end = int(end_raw)
            step = 1 if start <= end else -1
            for year in range(start, end + step, step):
                if year not in seen:
                    years.append(year)
                    seen.add(year)
        else:
            year = int(part)
            if year not in seen:
                years.append(year)
                seen.add(year)
    return years


def get_years(session: requests.Session) -> List[int]:
    html = fetch_html(session, f"{BASE_URL}/posts")
    soup = BeautifulSoup(html, "html.parser")
    years = []
    for link in soup.select("ul.archive-years a[href]"):
        href = link.get("href", "")
        match = YEAR_LINK_RE.search(href)
        if match:
            years.append(int(match.group(1)))
    years = sorted(set(years), reverse=True)
    return years


def get_month_links(session: requests.Session, year: int) -> List[Tuple[int, int, str]]:
    html = fetch_html(session, f"{BASE_URL}/posts/{year}", turbo_stream=True)
    soup = BeautifulSoup(html, "html.parser")
    links: List[Tuple[int, int, str]] = []
    for anchor in soup.select("a[href]"):
        href = anchor.get("href", "")
        match = MONTH_LINK_RE.search(href)
        if match:
            month_year = int(match.group(1))
            month = int(match.group(2))
            links.append((month_year, month, f"{BASE_URL}{href}"))
    links = sorted(set(links), key=lambda item: (item[0], item[1]), reverse=True)
    return links


def parse_date(text: str, fallback_audio_url: Optional[str] = None) -> Optional[str]:
    match = DATE_RE.search(text)
    if match:
        day, month, year = match.groups()
        return f"{year}-{month}-{day}"
    if fallback_audio_url:
        match = MP3_DATE_RE.search(fallback_audio_url)
        if match:
            year, month, day = match.groups()
            return f"{year}-{month}-{day}"
    return None


def extract_posts_from_month(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    posts: List[Dict[str, str]] = []
    for article in soup.select("article.post"):
        title_link = article.select_one("h3.title a[href]")
        if not title_link:
            continue
        title = normalize_whitespace(title_link.get_text(" ", strip=True))
        href = title_link.get("href", "")
        post_url = f"{BASE_URL}{href}" if href.startswith("/") else href
        slug = href.rstrip("/").split("/")[-1]
        audio_link = article.select_one("a[href$='.mp3']")
        audio_url = audio_link.get("href") if audio_link else ""
        transcription_link = article.select_one("a[href*='transcription=true']")
        has_transcription = bool(transcription_link)
        date_iso = parse_date(title, fallback_audio_url=audio_url)
        year = ""
        month = ""
        if date_iso:
            year = date_iso.split("-")[0]
            month = date_iso.split("-")[1]
        posts.append(
            {
                "id": slug,
                "title": title,
                "date": date_iso or "",
                "year": year,
                "month": month,
                "post_url": post_url,
                "audio_url": audio_url,
                "has_transcription": "1" if has_transcription else "0",
            }
        )
    return posts


def parse_time_label(label: str) -> Optional[int]:
    if not TIME_LABEL_RE.match(label):
        return None
    parts = [int(part) for part in label.split(":")]
    if len(parts) == 2:
        minutes, seconds = parts
        return minutes * 60 + seconds
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return hours * 3600 + minutes * 60 + seconds
    return None


def parse_transcript_segments(container: Tag) -> List[Dict[str, str]]:
    segments: List[Dict[str, str]] = []
    for paragraph in container.find_all("p"):
        current_label: Optional[str] = None
        current_time: Optional[int] = None
        current_text: List[str] = []

        def flush_segment() -> None:
            nonlocal current_label, current_time, current_text
            if current_label is None:
                return
            text = normalize_whitespace(" ".join(current_text))
            if text:
                segments.append(
                    {
                        "label": current_label,
                        "t": current_time if current_time is not None else 0,
                        "text": text,
                    }
                )
            current_label = None
            current_time = None
            current_text = []

        for node in paragraph.contents:
            if isinstance(node, Tag) and node.name == "a":
                flush_segment()
                label = node.get_text(strip=True)
                current_label = label
                current_time = parse_time_label(label)
            elif isinstance(node, Tag) and node.name == "br":
                flush_segment()
            elif isinstance(node, NavigableString):
                if current_label is not None:
                    current_text.append(str(node))
            elif isinstance(node, Tag):
                if current_label is not None:
                    current_text.append(node.get_text(" ", strip=True))

        flush_segment()

    return segments


def fetch_transcript(session: requests.Session, post_url: str) -> Optional[dict]:
    html = fetch_html(session, f"{post_url}?transcription=true")
    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one("div.post-transcription")
    if not container:
        return None
    segments = parse_transcript_segments(container)
    if not segments:
        text = (
            container.get_text(" ", strip=True)
            .replace("Transcripción automática", "")
            .strip()
        )
        text = normalize_whitespace(text)
        if not text:
            return None
        return {"text": text}
    full_text = normalize_whitespace(" ".join(segment["text"] for segment in segments))
    return {"segments": segments, "text": full_text}


def load_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Venganzas del Pasado archive into a lightweight JSON index."
    )
    parser.add_argument(
        "--out",
        default="site/data",
        help="Output directory for index.json and transcripts.json",
    )
    parser.add_argument(
        "--years",
        help="Comma-separated years and ranges (e.g. 2025,2024-2020). Defaults to all years.",
    )
    parser.add_argument(
        "--with-transcripts",
        action="store_true",
        help="Fetch and store transcripts in transcripts.json",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Delay (seconds) between requests",
    )
    parser.add_argument(
        "--max-months",
        type=int,
        default=0,
        help="Limit months per year (0 = all). Useful for quick tests.",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable progress output.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    index_path = out_dir / "index.json"
    transcripts_path = out_dir / "transcripts.json"

    session = requests.Session()

    if args.years:
        years = parse_years_arg(args.years)
    else:
        years = get_years(session)

    year_months: Dict[int, List[Tuple[int, int, str]]] = {}
    total_months = 0
    for year in years:
        month_links = get_month_links(session, year)
        if args.max_months and args.max_months > 0:
            month_links = month_links[: args.max_months]
        year_months[year] = month_links
        total_months += len(month_links)

    existing_index = load_json(index_path) or {"posts": []}
    existing_posts = {post["id"]: post for post in existing_index.get("posts", [])}

    transcripts = {}
    if args.with_transcripts:
        transcripts = load_json(transcripts_path) or {}

    class NullProgress:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def add_task(self, *args, **kwargs):
            return 0

        def advance(self, *args, **kwargs):
            return None

        def update(self, *args, **kwargs):
            return None

    new_posts = 0
    progress = (
        NullProgress()
        if args.no_progress
        else Progress(
            SpinnerColumn(),
            TextColumn("{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            transient=True,
        )
    )

    with progress:
        month_task = progress.add_task("Meses", total=total_months)
        transcript_task = progress.add_task("Transcripciones 0", total=None)
        transcript_count = 0

        for year in years:
            month_links = year_months.get(year, [])
            for _, _, month_url in month_links:
                html = fetch_html(session, month_url)
                posts = extract_posts_from_month(html)
                for post in posts:
                    post_id = post["id"]
                    if post_id in existing_posts:
                        existing_posts[post_id].update(
                            {k: v for k, v in post.items() if v}
                        )
                    else:
                        existing_posts[post_id] = post
                        new_posts += 1
                    if args.with_transcripts and post.get("has_transcription") == "1":
                        if not transcripts.get(post_id):
                            transcript_text = fetch_transcript(
                                session, post["post_url"]
                            )
                            if transcript_text:
                                transcripts[post_id] = transcript_text
                                transcript_count += 1
                                progress.update(
                                    transcript_task,
                                    description=f"Transcripciones {transcript_count}",
                                )
                                progress.advance(transcript_task)
                progress.advance(month_task)
                time.sleep(args.delay)

    posts_list = list(existing_posts.values())
    posts_list.sort(key=lambda item: item.get("date", ""), reverse=True)

    index_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": BASE_URL,
        "posts": posts_list,
        "new_posts": new_posts,
    }
    save_json(index_path, index_data)

    if args.with_transcripts:
        save_json(transcripts_path, transcripts)


if __name__ == "__main__":
    main()
