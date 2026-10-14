# Speakit — Discord-like Chat & Voice

Speakit is a full-stack Discord clone: servers, text + voice channels, real-time chat, DMs, friends, reactions, typing indicators, presence, image/GIF sharing, and WebRTC voice.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Socket.io real-time server (custom `server.ts`, plain Node)
- Prisma + **Supabase Postgres** (pooler for app, direct for migrations)
- **Supabase Auth** (email + username login) with auto-refreshing sessions
- **Supabase Storage** (`chat-uploads`, `avatars` buckets)
- WebRTC mesh voice (no external keys, STUN only)

## Supabase one-time setup

1. Create the project (done) and note URL + publishable key in `.env`.
2. **SQL Editor → New query** → paste `scripts/supabase-storage.sql` → Run
   (creates the `chat-uploads`, `avatars` and `emojis` buckets and their policies;
   re-run after updating Speakit — the file is idempotent).
3. **Authentication → Providers → Email → turn OFF "Confirm email"**
   (otherwise every registration parks at "check your inbox").
4. GIF search runs on **Klipy**: put your key in `KLIPY_API_KEY` (server env + Render env).

## Run it

```bash
./speakit.sh start   # install deps, sync DB, run backend+frontend (prints the URL — random free port)
./speakit.sh test    # typecheck + smoke tests + live frontend/backend checks
./speakit.sh doctor  # self-check if something looks wrong
```

Open the URL the script prints → Register (email + username) → Create a server → Invite friends with the 8-char code.
Force a port with `./speakit.sh start 5000` or `PORT=5000 ./speakit.sh start`.

Manual equivalent:

```bash
npm install
npm run db:push
npm run dev
```

- `npm run dev` — dev with hot reload + Socket.io
- `npm run build` + `npm start` — production
- `npm run typecheck` — zero TypeScript errors
- `npm run db:studio` — view DB

## Host it free (Render)

Speakit needs a real Node server (websockets), so GitHub Pages can't host the
app itself — but **Render's free tier** can:

1. Push this folder to a GitHub repo (`.env` is gitignored — secrets stay local).
2. [Render Dashboard](https://dashboard.render.com) → **New → Web Service** →
   pick the repo. (Or **New → Blueprint** and point at `render.yaml`.)
3. Build command: `npm install && npm run build` · Start command: `npm start`.
4. Environment → add `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (copy values from your local `.env`).
5. Deploy → open the `https://speakit-xyz.onrender.com` URL → Register.

Free-tier notes: the service **sleeps after ~15 min idle** (first visit wakes it in
~30–60s), websockets work fine, and Supabase stays as the always-on database.
Alternatives if you outgrow it: Koyeb free tier, Fly.io allowances, or any VPS.

## Features

- Auth (Supabase: email register, username-or-email login, logout, sessions)
- Servers (create, join via code/link/directory, custom icons, **leave**/delete)
- Server settings: overview, channel **categories**, **roles & permissions**, custom emoji, members (**kick/ban**), invites (regenerate + custom codes at 10 members), discovery
- Channels (text + voice, create/delete/move between categories)
- Real-time messages (**500 chars**, send/edit/delete, replies, optimistic UI, auto-delete after 7 days)
- **Pins** (per channel, with jump-to)
- **Images, GIFs & audio** in channels + DMs (Supabase Storage, 8 MB max)
- **Emoji picker**, **server custom emoji** (`:name:`), cross-server toggle, custom-emoji reactions
- **Klipy GIF search + favorites**
- Reactions, typing indicators, presence
- Friends (request/accept/decline) + DMs (real-time)
- **Profiles** (display name, status, custom status, uploaded avatar incl. GIFs, banners incl. animated)
- **Light + dark mode**
- Voice channels (join, mute/deafen, peer grid with pfps + names, screen sharing, WebRTC audio)
- Channel permissions (per-role view/talk/react/connect, cog per channel)
- Mentions only on @ping/reply, per-channel + DM mute bells, desktop pings
- Commit helper: `./commit.sh "message"` (asks if you run it bare)

## Custom domain (put the app on your website)

The app lives at `https://speakit-hmds.onrender.com`. To serve it from your own
domain (e.g. `chat.yourdomain.com`):

1. Render dashboard → your service → **Settings → Custom Domains** → **Add** →
   type `chat.yourdomain.com`. Render shows you the DNS target (your
   `*.onrender.com` hostname).
2. At your domain registrar (where you bought the domain) → **DNS settings** →
   add a **CNAME** record: Host/Name `chat`, Value/Target `speakit-hmds.onrender.com`.
   (Use any subdomain — never CNAME the bare root domain; roots need ALIAS/ANAME
   records where supported, or just use `www`.)
3. Wait for DNS (minutes to hours) → Render auto-issues HTTPS → your subdomain works.
4. On your GitHub Pages site, link the buttons to `https://chat.yourdomain.com`
   (see `speakit-website/`).

No custom domain? Just link straight to the `*.onrender.com` URL — zero DNS needed.

## Project layout

- `server.ts` — Next + Socket.io (auth, chat, DM, presence, voice signaling)
- `prisma/schema.prisma` — User, Server, Channel, Message, Attachment, Reaction, Friendship, DMs
- `src/app/api/*` — REST (auth, servers, channels, messages, friends, DMs)
- `src/components/*` — Discord-like UI
- `src/store/*` — Zustand (auth, app, chat, voice)
- `src/hooks/useVoice.tsx` — WebRTC mesh + persistent voice bridge
- `scripts/supabase-storage.sql` — buckets + storage policies for Supabase
- `render.yaml` — one-click free deploy on Render

## Notes

- Voice uses peer-to-peer mesh; works on localhost and LAN. For internet-scale, add TURN.
