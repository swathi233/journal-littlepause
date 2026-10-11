# Little Pause

A responsive, pastel journaling app with cute stickers, a daily quote, mood check-ins, journal history, and four original synthesized calming audio loops. Backend: FastAPI + SQLite. Frontend: HTML/CSS/JavaScript. Includes PWA install support and a Capacitor Android wrapper starter.

## Run locally on Windows

1. Install Python 3.10 or newer.
2. Extract this folder and open it in VS Code.
3. In the terminal, run:

   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   python -m pip install -r requirements.txt
   python -m uvicorn main:app --reload
   ```

4. Open `http://127.0.0.1:8000`.

The app migrates an existing `journal.db` by adding missing columns. This source package deliberately does not include any database file or journal entries.

## Deploy backend to Railway

1. Create a GitHub repository and upload the project source. Do not upload `.env`, database files, or private journal entries.
2. In Railway, create a project and choose **Deploy from GitHub repo**.
3. Railway uses `railway.json` to start the FastAPI server on the provided `$PORT`.
4. In the Railway service, add a persistent volume mounted at `/data`.
5. Add the service variable `DATABASE_PATH=/data/journal.db` and redeploy.
6. Under service Settings / Networking, generate a public domain and test `https://YOUR-DOMAIN/health` (expect `{"status":"ok"}`).

Railway volumes persist files between deploys. The current starter app does not have authentication or per-user data separation. Do not put real private journal entries on a public deployment until those protections are implemented and tested.

## Install as an app (PWA)

On the deployed HTTPS domain, open the app in a supported browser and choose **Install app** or **Add to Home Screen**. On iPhone/iPad use Safari's Share menu then **Add to Home Screen**. It launches in standalone app mode on supported devices.

## Build an Android APK (direct install, not Play Store)

The Android wrapper is in `android-wrapper/README_ANDROID.md`. It loads the deployed HTTPS server inside an Android shell; it requires internet and the server must stay available. You must build the APK locally with Node.js and Android Studio; this ZIP does not contain a prebuilt APK.

## Play Store

For Google Play, generate a signed Android App Bundle (`.aab`) in Android Studio, protect and back up the signing key, and complete the current Play Console testing, privacy, and listing requirements. Store policies and account requirements may change.
