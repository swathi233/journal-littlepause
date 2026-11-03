import hashlib
import os
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "journal.db")))
VISITOR_COOKIE = "littlepause_visitor"
VISITOR_COOKIE_AGE = 60 * 60 * 24 * 365 * 2

STATIC_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Little Pause", description="A gentle journaling and calming app", version="1.0.0")


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def is_https(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
    return request.url.scheme == "https" or forwarded == "https"


def owner_key(visitor_id: str) -> str:
    return hashlib.sha256(visitor_id.encode("utf-8")).hexdigest()


def initialize_database():
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
                best_thing TEXT NOT NULL DEFAULT '',
                user_name TEXT NOT NULL DEFAULT 'friend',
                owner_user_id INTEGER,
                owner_key TEXT
            )
        """)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(journal_entries)").fetchall()}
        additions = {
            "created_at": "TEXT NOT NULL DEFAULT ''",
            "mood": "TEXT NOT NULL DEFAULT 'Okay'",
            "stress": "INTEGER NOT NULL DEFAULT 5",
            "anxiety": "INTEGER NOT NULL DEFAULT 5",
            "energy": "INTEGER NOT NULL DEFAULT 5",
            "journal_text": "TEXT NOT NULL DEFAULT ''",
            "gratitude": "TEXT NOT NULL DEFAULT ''",
            "best_thing": "TEXT NOT NULL DEFAULT ''",
            "user_name": "TEXT NOT NULL DEFAULT 'friend'",
            "owner_user_id": "INTEGER",
            "owner_key": "TEXT",
        }
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE journal_entries ADD COLUMN {name} {definition}")
        conn.execute(
            "UPDATE journal_entries SET created_at = ? WHERE created_at = '' OR created_at IS NULL",
            (datetime.now().astimezone().isoformat(timespec="seconds"),),
        )


initialize_database()


class JournalEntry(BaseModel):
    mood: str = Field(default="Okay", max_length=30)
    stress: int = Field(default=5, ge=1, le=10)
    anxiety: int = Field(default=5, ge=1, le=10)
    energy: int = Field(default=5, ge=1, le=10)
    journal_text: str = Field(default="", max_length=12000)
    gratitude: str = Field(default="", max_length=2000)
    best_thing: str = Field(default="", max_length=2000)


def require_visitor(visitor_id: Optional[str] = Cookie(default=None, alias=VISITOR_COOKIE)) -> str:
    if not visitor_id or len(visitor_id) < 40:
        raise HTTPException(status_code=401, detail="Your browser identity is missing. Refresh the page to continue.")
    return owner_key(visitor_id)


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def home():
    path = STATIC_DIR / "index.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Frontend not found.")
    return FileResponse(path, headers={"Cache-Control": "no-cache"})


@app.get("/manifest.webmanifest")
def manifest():
    path = STATIC_DIR / "manifest.webmanifest"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="manifest.webmanifest was not found.")
    return FileResponse(path, media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    path = STATIC_DIR / "sw.js"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="sw.js was not found.")
    return FileResponse(path, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/health")
def health():
    return {"status": "ok", "app": "Little Pause", "timestamp": datetime.now().astimezone().isoformat(timespec="seconds")}


@app.get("/api/identity")
def get_identity(
    request: Request,
    response: Response,
    visitor_id: Optional[str] = Cookie(default=None, alias=VISITOR_COOKIE),
):
    # No account or password: a private random identifier is kept in this browser's first-party cookie.
    if not visitor_id or len(visitor_id) < 40:
        visitor_id = secrets.token_urlsafe(48)
        response.set_cookie(
            key=VISITOR_COOKIE,
            value=visitor_id,
            httponly=True,
            secure=is_https(request),
            samesite="strict",
            max_age=VISITOR_COOKIE_AGE,
            path="/",
        )
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@app.post("/api/entries", status_code=201)
def save_entry(entry: JournalEntry, visitor: str = Depends(require_visitor)):
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO journal_entries (
                created_at, mood, stress, anxiety, energy, journal_text,
                gratitude, best_thing, owner_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (now, entry.mood, entry.stress, entry.anxiety, entry.energy,
             entry.journal_text, entry.gratitude, entry.best_thing, visitor),
        )
    return {"ok": True, "id": cursor.lastrowid, "created_at": now}


@app.get("/api/entries")
def list_entries(visitor: str = Depends(require_visitor)):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, mood, stress, anxiety, energy,
                   journal_text, gratitude, best_thing
            FROM journal_entries
            WHERE owner_key = ?
            ORDER BY id DESC
            LIMIT 100
            """,
            (visitor,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int, visitor: str = Depends(require_visitor)):
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM journal_entries WHERE id = ? AND owner_key = ?",
            (entry_id, visitor),
        )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"ok": True, "id": entry_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
