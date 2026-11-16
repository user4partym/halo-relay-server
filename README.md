# Halo Relay

User's own CORS relay for the Halo Admin Page.

Halo's server sends `Access-Control-Allow-Origin` **twice** on `/admin-api/*`
and `/ruoyi-api/*`, so browsers reject every cross-origin call from the
Halo Admin Page. This tiny Node server (no dependencies) forwards requests
to `https://www.halo-voice.com` and returns a **single** CORS header.

## What it forwards

Only these two prefixes, nothing else (not an open proxy):

- `/admin-api/*` → `https://www.halo-voice.com/admin-api/*`
- `/ruoyi-api/*` → `https://www.halo-voice.com/ruoyi-api/*`

Also accepts the `/relay/admin-api/*` and `/relay/ruoyi-api/*` forms.

## Security

- The Admin-Token / password are **never logged and never stored**.
  Logs contain only method + path + status.
- No credentials of its own, no env vars needed.
- Body limit 5 MB (same as the Halo panel).

## Run

```bash
npm install   # no dependencies, safe to skip
node server.js
```

Render settings (Free): Node, Region Singapore, Build `npm install`,
Start `node server.js`, port from `PORT` env (Render sets it).

## Health

`GET /health` → `{"ok":true,"service":"halo-relay"}`
