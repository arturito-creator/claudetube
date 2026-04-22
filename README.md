# ClaudeTube

The YouTube for [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)
animations.

Claude Design (Anthropic Labs, 2026-04-17) generates live HTML animations
rather than pixel-based video files. That's powerful — interactivity, shaders,
3D, embedded video all survive — but it leaves one obvious gap: there's no way
to *share* a finished piece with a viewer who doesn't have Claude. ClaudeTube
is that gap. Upload your Claude Design ZIP bundle; viewers watch it live in a
sandboxed iframe, no re-encoding, no quality loss, all interactivity intact.

## Features (MVP)

- ZIP upload of Claude Design bundles (HTML + assets + imported video)
- Per-user channels, email + password auth (optional GitHub OAuth)
- Public feed, channel pages, watch page with a sandboxed player
- Companion video sync via a small `postMessage` contract
- Headless-Chromium thumbnail capture on upload
- Likes, basic full-text search (Postgres `tsvector`)

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Auth.js v5 (NextAuth) with Prisma adapter
- S3-compatible object storage (MinIO in dev, S3 in prod)
- Playwright for thumbnail capture

## Local dev

```bash
cp .env.example .env
docker compose up -d
npm install
npx playwright install chromium
npm run db:push
psql "$DATABASE_URL" -f prisma/migrations/001_tsvector.sql
npm run dev
```

Open http://localhost:3000, sign up, upload
`fixtures/sample-bundle` zipped up. Confirm:

- thumbnail appears on the feed
- the animation plays in a sandboxed iframe on the watch page
- Play/Pause toggles the animation (and companion video if present)

### Run tests

```bash
npm test
```

## Security notes

User-supplied HTML is treated as hostile.

- The extractor (`lib/zip.ts`) rejects absolute paths, parent traversal,
  symlinks, disallowed extensions, and enforces both per-file and total
  size caps (zip-bomb guard).
- Bundles should be served from a **different origin** than the app
  (`BUNDLE_ORIGIN`) so the sandboxed iframe is a real cross-origin boundary.
  In dev, without `BUNDLE_ORIGIN`, we fall back to same-origin and rely on
  `<iframe sandbox>` alone.
- The bundle route sets a restrictive CSP, pins `frame-ancestors` to the app
  origin, and forbids form actions and navigation.

## Deploy

- Point `BUNDLE_ORIGIN` at a separate subdomain backed by the same app.
- Provide real S3 credentials and set `S3_FORCE_PATH_STYLE=false`.
- Set `AUTH_SECRET` to a random 32-byte value and `AUTH_URL` to the public app URL.

## Roadmap

- Comments, subscriptions, recommendations
- Server-side MP4 rendering for share previews (not primary playback)
- Bundle manifest (`claudedesign.json`) richer integration (chapters, duration)
- DMCA/takedown tooling
