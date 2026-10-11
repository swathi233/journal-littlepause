import os
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "journal.db")))

app = FastAPI(title="Little Pause", description="A gentle journaling and calming app")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def get_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT '',
                mood TEXT NOT NULL DEFAULT 'Okay',
                stress INTEGER NOT NULL DEFAULT 5,
                anxiety INTEGER NOT NULL DEFAULT 5,
                energy INTEGER NOT NULL DEFAULT 5,
                journal_text TEXT NOT NULL DEFAULT '',
                gratitude TEXT NOT NULL DEFAULT '',
                best_thing TEXT NOT NULL DEFAULT ''
            )
        """)


def migrate_database():
    """Add missing columns to an older local database without deleting entries."""
    with get_connection() as conn:
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(journal_entries)").fetchall()}
        required = {
            "created_at": "TEXT NOT NULL DEFAULT ''",
            "mood": "TEXT NOT NULL DEFAULT 'Okay'",
            "stress": "INTEGER NOT NULL DEFAULT 5",
            "anxiety": "INTEGER NOT NULL DEFAULT 5",
            "energy": "INTEGER NOT NULL DEFAULT 5",
            "journal_text": "TEXT NOT NULL DEFAULT ''",
            "gratitude": "TEXT NOT NULL DEFAULT ''",
            "best_thing": "TEXT NOT NULL DEFAULT ''",
        }
        for column, definition in required.items():
            if column not in existing:
                conn.execute("ALTER TABLE journal_entries ADD COLUMN " + column + " " + definition)
        conn.execute("UPDATE journal_entries SET created_at = ? WHERE created_at = '' OR created_at IS NULL", (datetime.now().isoformat(timespec="seconds"),))


initialize_database()
migrate_database()


class JournalEntry(BaseModel):
    mood: str = Field(default="Okay", max_length=30)
    stress: int = Field(default=5, ge=1, le=10)
    anxiety: int = Field(default=5, ge=1, le=10)
    energy: int = Field(default=5, ge=1, le=10)
    journal_text: str = Field(default="", max_length=12000)
    gratitude: str = Field(default="", max_length=2000)
    best_thing: str = Field(default="", max_length=2000)


@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/entries")
def save_entry(entry: JournalEntry):
    now = datetime.now().isoformat(timespec="seconds")
    try:
        with get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO journal_entries
                (created_at, mood, stress, anxiety, energy, journal_text, gratitude, best_thing)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (now, entry.mood, entry.stress, entry.anxiety, entry.energy,
                  entry.journal_text, entry.gratitude, entry.best_thing))
            entry_id = cursor.lastrowid
        return {"ok": True, "id": entry_id, "created_at": now}
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail="Could not save your entry. Please check the database configuration.") from exc


@app.get("/api/entries")
def list_entries():
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT id, created_at, mood, stress, anxiety, energy, journal_text, gratitude, best_thing
            FROM journal_entries ORDER BY id DESC LIMIT 100
        """).fetchall()
    return [dict(row) for row in rows]


@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}
