
import os
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


# --------------------------------------------------
# 1. PATHS AND CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Use a persistent disk path in your hosting platform if available.
DB_PATH = Path(
    os.getenv("DATABASE_PATH", str(BASE_DIR / "journal.db"))
)

# Create the static folder if it does not exist.
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Little Pause",
    description="A gentle journaling and calming app",
    version="1.0.0",
)


# --------------------------------------------------
# 2. DATABASE CONNECTION
# --------------------------------------------------

def get_connection():
    """Create a SQLite connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=30,
    )
    conn.row_factory = sqlite3.Row
    return conn


# --------------------------------------------------
# 3. DATABASE INITIALIZATION
# --------------------------------------------------

def initialize_database():
    """Create the journal table if it does not exist."""

    with get_connection() as conn:
        conn.execute(
            """
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
            """
        )


def migrate_database():
    """
    Add missing columns to an older database without
    deleting existing journal entries.
    """

    required_columns = {
        "created_at": "TEXT NOT NULL DEFAULT ''",
        "mood": "TEXT NOT NULL DEFAULT 'Okay'",
        "stress": "INTEGER NOT NULL DEFAULT 5",
        "anxiety": "INTEGER NOT NULL DEFAULT 5",
        "energy": "INTEGER NOT NULL DEFAULT 5",
        "journal_text": "TEXT NOT NULL DEFAULT ''",
        "gratitude": "TEXT NOT NULL DEFAULT ''",
        "best_thing": "TEXT NOT NULL DEFAULT ''",
    }

    with get_connection() as conn:
        existing_columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(journal_entries)"
            ).fetchall()
        }

        for column, definition in required_columns.items():
            if column not in existing_columns:
                conn.execute(
                    f"ALTER TABLE journal_entries "
                    f"ADD COLUMN {column} {definition}"
                )

        # Fill missing timestamps on older entries.
        conn.execute(
            """
            UPDATE journal_entries
            SET created_at = ?
            WHERE created_at = '' OR created_at IS NULL
            """,
            (datetime.now().isoformat(timespec="seconds"),),
        )


# Initialize the database when the application module loads.
initialize_database()
migrate_database()


# --------------------------------------------------
# 4. REQUEST VALIDATION
# --------------------------------------------------

class JournalEntry(BaseModel):
    mood: str = Field(default="Okay", max_length=30)
    stress: int = Field(default=5, ge=1, le=10)
    anxiety: int = Field(default=5, ge=1, le=10)
    energy: int = Field(default=5, ge=1, le=10)
    journal_text: str = Field(default="", max_length=12000)
    gratitude: str = Field(default="", max_length=2000)
    best_thing: str = Field(default="", max_length=2000)


# --------------------------------------------------
# 5. FRONTEND
# --------------------------------------------------

# Make files inside static available at /static/...
app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)


@app.get("/")
def home():
    """Serve the main Little Pause page."""

    index_file = STATIC_DIR / "index.html"

    if not index_file.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Frontend not found. Add your index.html "
                "file inside the static folder."
            ),
        )

    return FileResponse(index_file)


@app.get("/manifest.webmanifest")
def manifest():
    """Serve the Progressive Web App manifest."""

    manifest_file = STATIC_DIR / "manifest.webmanifest"

    if not manifest_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="manifest.webmanifest was not found.",
        )

    return FileResponse(
        manifest_file,
        media_type="application/manifest+json",
    )


@app.get("/sw.js")
def service_worker():
    """Serve the service worker."""

    worker_file = STATIC_DIR / "sw.js"

    if not worker_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="sw.js was not found.",
        )

    return FileResponse(
        worker_file,
        media_type="application/javascript",
    )


# --------------------------------------------------
# 6. HEALTH CHECK
# --------------------------------------------------

@app.get("/health")
def health():
    """Check whether the API is running."""

    return {
        "status": "ok",
        "app": "Little Pause",
        "timestamp": datetime.now().isoformat(
            timespec="seconds"
        ),
    }


# --------------------------------------------------
# 7. SAVE A JOURNAL ENTRY
# --------------------------------------------------

@app.post("/api/entries", status_code=201)
def save_entry(entry: JournalEntry):
    """Save a new journal entry."""

    now = datetime.now().isoformat(timespec="seconds")

    try:
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO journal_entries (
                    created_at,
                    mood,
                    stress,
                    anxiety,
                    energy,
                    journal_text,
                    gratitude,
                    best_thing
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now,
                    entry.mood,
                    entry.stress,
                    entry.anxiety,
                    entry.energy,
                    entry.journal_text,
                    entry.gratitude,
                    entry.best_thing,
                ),
            )

            entry_id = cursor.lastrowid

        return {
            "ok": True,
            "message": "Your journal entry was saved.",
            "id": entry_id,
            "created_at": now,
        }

    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not save your entry. "
                "Please check the database configuration."
            ),
        ) from exc


# --------------------------------------------------
# 8. GET JOURNAL HISTORY
# --------------------------------------------------

@app.get("/api/entries")
def list_entries():
    """Return the 100 most recent journal entries."""

    try:
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    created_at,
                    mood,
                    stress,
                    anxiety,
                    energy,
                    journal_text,
                    gratitude,
                    best_thing
                FROM journal_entries
                ORDER BY id DESC
                LIMIT 100
                """
            ).fetchall()

        return [dict(row) for row in rows]

    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Could not load journal history.",
        ) from exc


# --------------------------------------------------
# 9. DELETE A JOURNAL ENTRY
# --------------------------------------------------

@app.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int):
    """Delete a journal entry by its ID."""

    try:
        with get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM journal_entries WHERE id = ?",
                (entry_id,),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Journal entry not found.",
                )

        return {
            "ok": True,
            "message": "Journal entry deleted.",
            "id": entry_id,
        }

    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Could not delete the journal entry.",
        ) from exc


# --------------------------------------------------
# 10. RUN LOCALLY
# --------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
    )