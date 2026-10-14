# Speakit website (GitHub Pages)

Static landing page for Speakit. No build step — pure HTML/CSS/JS.

## Publish it (2 minutes)

**Option A — its own repo (recommended):**
1. Create a new GitHub repo (e.g. `speakit-website`).
2. Upload the **contents** of this folder (`index.html`, `styles.css`, `app.js`) to the repo root.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)` → Save.
4. Wait ~1 minute → your site is live at `https://YOUR-USERNAME.github.io/speakit-website/`.

**Option B — inside your existing website repo:**
Upload the three files into a subfolder (e.g. `speakit/`), commit, and Pages serves it at `https://YOUR-USERNAME.github.io/YOUR-REPO/speakit/`.
Keep Pages source as-is (whatever your site already uses).

## Point buttons at your live app

Open `index.html`, search for `href="#"` (2 spots: nav + hero buttons) and replace with
your app URL. Or uncomment the two lines at the bottom of `app.js`.

## Important: what Pages can and cannot do

- ✅ This landing page (static) — perfect for GitHub Pages.
- ❌ The Speakit app itself (Next.js + Socket.io + database) — Pages can't run servers.
  Host the app on a Node host (VPS, Railway, Render, Fly.io…) and link to it from here.
