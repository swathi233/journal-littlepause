import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "journal.db")))
SESSION_COOKIE = "littlepause_session"
SESSION_LIFETIME = timedelta(days=30)
PASSWORD_ITERATIONS = 310_000

STATIC_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Little Pause", description="A gentle journaling and calming app", version="1.0.0")


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_utc():
    return datetime.now(timezone.utc)


def request_is_https(request: Request) -> bool:
    # Railway and other reverse proxies terminate HTTPS before forwarding to Uvicorn.
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def initialize_database():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            )
        """)
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
                owner_user_id INTEGER REFERENCES users(id)
            )
        """)

        # Keep existing entries, but leave their ownership unset so they are not exposed to new accounts.
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
            "owner_user_id": "INTEGER REFERENCES users(id)",
        }
        for name, definition in additions.items():
            if name not in columns:
                conn.execute(f"ALTER TABLE journal_entries ADD COLUMN {name} {definition}")
        conn.execute(
            "UPDATE journal_entries SET created_at = ? WHERE created_at = '' OR created_at IS NULL",
            (now_utc().isoformat(timespec="seconds"),),
        )


initialize_database()


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class JournalEntry(BaseModel):
    mood: str = Field(default="Okay", max_length=30)
    stress: int = Field(default=5, ge=1, le=10)
    anxiety: int = Field(default=5, ge=1, le=10)
    energy: int = Field(default=5, ge=1, le=10)
    journal_text: str = Field(default="", max_length=12000)
    gratitude: str = Field(default="", max_length=2000)
    best_thing: str = Field(default="", max_length=2000)


def password_digest(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


def create_session(user_id: int, request: Request, response: Response):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = now_utc() + SESSION_LIFETIME
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, expires_at.isoformat(timespec="seconds")),
        )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
        max_age=int(SESSION_LIFETIME.total_seconds()),
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"


def require_user(session: Optional[str] = Cookie(default=None)):
    if not session:
        raise HTTPException(status_code=401, detail="Please sign in to access your journal.")
    token_hash = hashlib.sha256(session.encode("utf-8")).hexdigest()
    now = now_utc().isoformat(timespec="seconds")
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT users.id, users.username
            FROM user_sessions JOIN users ON users.id = user_sessions.user_id
            WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
            """,
            (token_hash, now),
        ).fetchone()
        if row is None:
            conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_hash,))
            raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")
    return {"id": row["id"], "username": row["username"], "token_hash": token_hash}


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def home():
    path = STATIC_DIR / "index.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Frontend not found.")
    return FileResponse(path)


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
    return FileResponse(path, media_type="application/javascript")


@app.get("/health")
def health():
    return {"status": "ok", "app": "Little Pause", "timestamp": now_utc().isoformat(timespec="seconds")}


@app.post("/api/auth/register", status_code=201)
def register(credentials: Credentials, request: Request, response: Response):
    username = credentials.username.strip()
    salt = secrets.token_bytes(16)
    digest = password_digest(credentials.password, salt)
    try:
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, salt, digest, now_utc().isoformat(timespec="seconds")),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="That username already exists. Sign in or choose another username.") from exc
    create_session(user_id, request, response)
    return {"id": user_id, "username": username}


@app.post("/api/auth/login")
def login(credentials: Credentials, request: Request, response: Response):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_salt, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (credentials.username.strip(),),
        ).fetchone()
    if row is None or not hmac.compare_digest(password_digest(credentials.password, row["password_salt"]), row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password. New here? Choose Create account first.")
    create_session(row["id"], request, response)
    return {"id": row["id"], "username": row["username"]}


@app.get("/api/auth/me")
def current_user(response: Response, user: dict = Depends(require_user)):
    response.headers["Cache-Control"] = "no-store"
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user: dict = Depends(require_user)):
    with get_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (user["token_hash"],))
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}


@app.post("/api/entries", status_code=201)
def save_entry(entry: JournalEntry, user: dict = Depends(require_user)):
    now = now_utc().isoformat(timespec="seconds")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO journal_entries (
                created_at, mood, stress, anxiety, energy, journal_text,
                gratitude, best_thing, user_name, owner_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (now, entry.mood, entry.stress, entry.anxiety, entry.energy, entry.journal_text,
             entry.gratitude, entry.best_thing, user["username"], user["id"]),
        )
    return {"ok": True, "id": cursor.lastrowid, "created_at": now}


@app.get("/api/entries")
def list_entries(user: dict = Depends(require_user)):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, mood, stress, anxiety, energy,
                   journal_text, gratitude, best_thing
            FROM journal_entries
            WHERE owner_user_id = ?
            ORDER BY id DESC
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()
    return [dict(row) for row in rows]


@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int, user: dict = Depends(require_user)):
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM journal_entries WHERE id = ? AND owner_user_id = ?",
            (entry_id, user["id"]),
        )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return {"ok": True, "id": entry_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
