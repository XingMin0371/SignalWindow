#!/usr/bin/env python3
"""One-shot, read-only import of AstrBot private-chat history into SignalWindow.

The AstrBot database is opened with SQLite mode=ro and query_only. Messages are
decoded in one pass and written to a temporary NDJSON file, then atomically
replaced. No AstrBot tables are modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

CST = timezone(timedelta(hours=8))
MARKER = ".astrbot-private-imported"
REMINDER = re.compile(r"<system_reminder>.*?</system_reminder>", re.S)
DATETIME_HINT = re.compile(r"Current datetime:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})")


def text_parts(content) -> tuple[str, str]:
    """Return (visible text, raw text); strip reminders and reasoning blocks."""
    if isinstance(content, str):
        return content, content
    if isinstance(content, dict):
        content = [content]
    if not isinstance(content, list):
        return "", ""

    visible: list[str] = []
    raw: list[str] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        kind = part.get("type")
        if kind in {"think", "tool", "tool_call", "tool_result"}:
            continue
        if kind in {"image", "file", "audio", "video"}:
            visible.append("[图片]" if kind == "image" else "[文件]")
            continue
        value = part.get("text") or part.get("content")
        if isinstance(value, str):
            raw.append(value)
            cleaned = REMINDER.sub("", value)
            if cleaned.strip():
                visible.append(cleaned)
    return "\n".join(visible).strip(), "\n".join(raw)


def parse_hint(raw: str) -> datetime | None:
    match = DATETIME_HINT.search(raw)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M").replace(tzinfo=CST)
    except ValueError:
        return None


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def load_private_rows(db: Path, platform: str, target_id: str) -> list[tuple[str, datetime, datetime]]:
    connection = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=10)
    connection.execute("PRAGMA query_only=ON")
    try:
        rows = connection.execute(
            """
            SELECT content, created_at, updated_at
            FROM conversations
            WHERE platform_id = ? AND user_id = ?
            ORDER BY updated_at ASC
            """,
            (platform, f"{platform}:FriendMessage:{target_id}"),
        ).fetchall()
    finally:
        connection.close()

    result = []
    for content, created_at, updated_at in rows:
        data = json.loads(content) if isinstance(content, str) else content
        if not isinstance(data, list):
            continue
        created = datetime.fromisoformat(str(created_at)).replace(tzinfo=CST)
        updated = datetime.fromisoformat(str(updated_at)).replace(tzinfo=CST)
        result.append((data, created, updated))
    return result


def build_records(rows, profile: str, target_id: str, max_messages: int) -> list[dict]:
    records: list[dict] = []
    previous: tuple[str, str] | None = None
    for data, created, updated in rows:
        current_time = created
        for item in data:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            if role not in {"user", "assistant"}:
                continue
            text, raw = text_parts(item.get("content"))
            hinted = parse_hint(raw)
            if hinted:
                current_time = hinted
            if not text:
                continue
            # Skip AstrBot's injected conversation summary and duplicate frames.
            if text.startswith("【历史摘要】"):
                continue
            key = (role, text)
            if key == previous:
                continue
            previous = key
            index = len(records)
            records.append({
                "id": f"astrbot-private-{index}",
                "profile": profile,
                "conversation": "private",
                "targetId": target_id,
                "role": role,
                "parts": [{"type": "text", "text": text}],
                "text": text,
                "source": "astrbot-import",
                "time": iso(current_time + timedelta(seconds=index)),
            })
            if max_messages and len(records) >= max_messages:
                return records
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=os.environ.get("ASTRBOT_DB", "/root/dsh-bots/astrbot/data/data_v4.db"))
    parser.add_argument("--data-dir", default=os.environ.get("SIGNAL_WINDOW_DATA", "/opt/signal-window-data"))
    parser.add_argument("--profile", default="main")
    parser.add_argument("--platform", default="snowluma")
    parser.add_argument("--target-id", required=True)
    parser.add_argument("--max", type=int, default=0, help="0 imports all private history")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    db = Path(args.db)
    data_dir = Path(args.data_dir)
    messages = data_dir / "messages.ndjson"
    marker = data_dir / MARKER
    if not db.is_file():
        raise SystemExit(f"AstrBot database not found: {db}")
    if marker.exists() and not args.force:
        print(f"skip: marker exists ({marker})")
        return 0

    rows = load_private_rows(db, args.platform, args.target_id)
    records = build_records(rows, args.profile, args.target_id, args.max)
    print(f"database={db} source_rows={len(rows)} imported={len(records)}")
    if not records:
        print("nothing to import")
        return 0
    for record in records[:2]:
        print("first:", record["role"], record["text"][:80].replace("\n", " "))
    if args.dry_run:
        return 0

    data_dir.mkdir(parents=True, exist_ok=True)
    existing: list[str] = []
    existing_keys: set[tuple[str, str]] = set()
    if messages.exists():
        with messages.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if item.get("source") != "astrbot-import":
                    existing.append(line.rstrip("\n"))
                    if item.get("conversation") == "private" and str(item.get("targetId")) == str(args.target_id):
                        existing_keys.add((str(item.get("role")), str(item.get("text") or "")))
        backup = messages.with_name(f"messages.ndjson.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(messages, backup)
        print(f"backup={backup}")

    if existing_keys:
        records = [record for record in records if (record["role"], record["text"]) not in existing_keys]
    if not records:
        print("nothing new after dedupe")
        return 0

    temporary = messages.with_name(f".{messages.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            for line in existing:
                handle.write(line + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, messages)
    finally:
        if temporary.exists():
            temporary.unlink(missing_ok=True)

    digest = hashlib.sha256(db.read_bytes()).hexdigest()[:16]
    marker.write_text(json.dumps({
        "imported": len(records),
        "source": "AstrBot conversations/private",
        "targetId": args.target_id,
        "db_sha256_prefix": digest,
        "at": iso(datetime.now(timezone.utc)),
    }, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"written={messages} total_records={len(records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
