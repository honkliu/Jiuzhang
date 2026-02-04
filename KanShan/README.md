# KanShan (React + .NET Minimal API)

A small “WeChat-like” web chat app:
- React (Vite + TypeScript) frontend
- .NET (Minimal API, **no controllers**) backend
- JWT auth (register/login)
- 1:1 chat + group chat
- Realtime messages via SignalR
- Image upload + send (served from `/uploads`)
- SQLite storage (local file)

## Prerequisites
- .NET SDK (8.x recommended) or newer that can target net8.0
- Node.js 18+

## Run (dev)

### 1) Start backend

In PowerShell:

```powershell
cd Q:\gitroot\Jiuzhang\KanShan\KanShan.Server
# Use the same port the frontend is configured for
dotnet run --urls http://localhost:5174
```

Backend URL: `http://localhost:5174`

Data files created under:
- SQLite DB: `KanShan.Server/App_Data/chat.db`
- Uploads: `KanShan.Server/App_Data/uploads/*` (public via `http://localhost:5174/uploads/...`)

### 2) Start frontend

In another PowerShell:

```powershell
cd Q:\gitroot\Jiuzhang\KanShan\KanShan.web
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Quick usage
1. Open `http://localhost:5173`
2. In dev, you can use **Quick login** as `alice`, `bob`, or `carol` (no password)
3. Or register your own users
4. Use the left search box to start a 1:1 chat
5. Use **New group** to create a group chat
6. Use **Image** to upload & send an image

### Dev-only shortcut
- Backend endpoint: `POST /api/auth/dev-login` with body `{ "userName": "alice" }` (only works in Development)

## Notes
- JWT signing key is in `KanShan.Server/appsettings.json` under `Jwt:SigningKey`. Change it for any non-dev usage.
- This is a minimal, clean architecture baseline; you can extend with read receipts, typing indicators, presence, message deletion, etc.
