# Drumsheet

A drum tablature / setlist editor, now a static installable PWA backed by
Firebase Firestore. Originally a Google Apps Script web app bound to a
Google Sheet (see `legacy-gas/` for the original source).

## Architecture

- Plain static HTML/CSS/JS — no build step, no bundler.
- `js/firebase-init.js` is the only file that talks to Firebase. It's an ES
  module that initializes the Firebase Web SDK (loaded from Google's CDN)
  and exposes `window.Firebase.{getConfig, saveConfig, listSongs, createSong,
  loadSong, saveSong, isTitleTaken}` plus a `window.firebaseReady`
  promise. Every other script is a classic (non-module) script, unchanged in
  spirit from the original app, and just awaits `window.firebaseReady` before
  calling into `window.Firebase`.
- Songs autosave (`js/data.js`, "AUTOSAVE"): any edit schedules a save
  300ms after the last change; the whole song (meta + rows) is written in one
  update, and only if it differs from what was last saved. There is no
  manual save button (Ctrl+S forces an immediate save).
- `js/print.js` draws the A4 PDF as vector graphics with the bundled
  `js/vendor/jspdf.umd.min.js` (jsPDF, MIT licensed). The preview renders
  that same PDF with `js/vendor/pdf.min.js` (pdf.js, Apache-2.0).
- `manifest.json` + `sw.js` make it installable and give it an offline app
  shell (the UI loads with no connection; editing songs still needs Firestore).
- Firestore layout:
  - `config/main` — one doc: `{ structures: [...], symbols: [...] }`
  - `songs/{autoId}` — one doc per song: `{ title, band, bpm, beat, rows, updatedAt }`,
    where `rows` is the same `{structure, lyrics, gridData}` shape the sheet used,
    with `gridData` still a JSON string.

Note: a song's Firestore document ID is independent of its title (unlike the
original, where the Sheet name *was* the song's identity, which made renaming
a song rename the sheet). Renaming a song here just updates the `title` field.

## 1. Set up Firestore

You have two options — pick whichever fits your Firebase project limit:

**Option A: new project.**
1. Go to the [Firebase Console](https://console.firebase.google.com/) and
   create a new project (Google Analytics is not needed, you can skip it).
2. **Build > Firestore Database > Create database.** Choose **Start in test
   mode** for now (open rules) — see "Security" below. Leave the database ID
   as `(default)`.
3. **Project settings** (gear icon) > **General** > scroll to **Your apps** >
   click the **Web** icon (`</>`) to register a new web app. Give it any
   nickname; you don't need Firebase Hosting for this step.
4. Firebase shows you a `firebaseConfig` object — copy it into
   `js/firebase-init.js`, replacing the `REPLACE_ME` placeholders.
5. Leave `FIRESTORE_DATABASE_ID` in `js/firebase-init.js` as `null`.

**Option B: reuse an existing project (avoids the project-count limit).**
Firestore supports multiple databases inside one project — you don't have to
share an existing default database with another app.
1. In that existing project: **Firestore Database** > the database selector
   at the top > **Create database**. Give it an ID other than `(default)`,
   e.g. `drumsheet`. Same "test mode" choice as above.
2. Use that project's *existing* web app config (or register a new web app
   in it, same as step 3 above) — copy its `firebaseConfig` into
   `js/firebase-init.js` as usual.
3. Set `FIRESTORE_DATABASE_ID` in `js/firebase-init.js` to the database ID
   you chose (e.g. `'drumsheet'`), not `null`.

### Security rules

The database is intentionally left open (per project decision) so the app
works with no login. In Firestore's **Rules** tab, that looks like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

This means anyone who finds the hosted URL can read/write all songs and
config — not just people who know about this app. Fine for a personal tool,
worth revisiting if it's ever shared more widely.

## 2. Migrate your existing Sheet data

1. Open your Google Sheet, go to **Extensions > Apps Script**.
2. Add a new file, paste in the contents of `legacy-gas/temp-export.gs`
   (this repo's copy — it reuses the existing `loadConfig()` from your
   `Code.gs`, so keep that file as-is).
3. Reload the Sheet. A **Drumsheet Migration** menu appears.
4. Click **Drumsheet Migration > Export All Data (for Firebase)**. A dialog
   opens with pre-selected, copyable JSON text — copy it (Ctrl/Cmd+C).
5. Paste that JSON back here in the conversation, and it'll be imported via
   `scripts/import-to-firebase.js` using a Firebase service account key
   (**Project settings > Service accounts > Generate new private key**).
6. Once confirmed in Firestore, you can delete `temp-export.gs` from the
   Apps Script project (and the menu it adds) — it's not needed after this.

## 3. Deploy to GitHub Pages

1. Push this repo to GitHub (already done if you're reading this from there).
2. In the repo: **Settings > Pages > Build and deployment > Source**, choose
   **Deploy from a branch**, pick the branch this app lives on and `/ (root)`.
3. Save. GitHub gives you a URL like
   `https://<org>.github.io/drumsheet/` — that's your installable PWA.

## Local development

Just serve the folder over HTTP (service workers require it — `file://`
won't work):

```
npx serve .
```

Then open the printed `localhost` URL.
