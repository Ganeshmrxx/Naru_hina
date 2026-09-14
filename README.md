# AllForward — Telegram Multi-Bot Network & Admin Control Panel

A production-grade Telegram automation ecosystem built with **Pyrogram (MTProto)**, **MongoDB**, **FastAPI**, and a **Next.js 16 (App Router) Dark Admin Dashboard**.

---

## Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │   Browser: Next.js Admin Panel      │
                        │       (Port 3000 / Dark Mode)       │
                        └──────────────────┬──────────────────┘
                                           │  REST / JWT
                                           ▼
                        ┌─────────────────────────────────────┐
                        │        FastAPI REST Server          │
                        │             (Port 8000)             │
                        └─────────┬─────────────────┬─────────┘
                                  │                 │
                ┌─────────────────▼──┐       ┌──────▼──────────────────┐
                │    BotManager      │       │     MongoDB Clusters    │
                │ Lifecycle & State  │       │  Cluster A & Cluster B  │
                └─────────┬──────────┘       └─────────────────────────┘
                          │
          ┌───────────────┼───────────────┬───────────────┐
          │               │               │               │
    MovieForwarder   TeraBoxModifier   Promoter 1 & 2   BackupForwarder
      (Session 1)      (Bot Token)     (Session 3 & 4)    (Session 2)
```

---

## 🤖 Bot Cluster Overview

| Bot | Client Type | Session / Token | Plugin Root | Primary Role |
|---|---|---|---|---|
| **Movie Forwarder** | Userbot | `Session 1` | `plugins_movie_forwarder` | Filters & mirrors files &gt;150MB to target archive with duplicate prevention via `newMovieDatas2`. |
| **TeraBox Modifier** | Bot Token | `tokentera` | `plugins_terabox_modifier` | Rewrites TeraBox links into streaming player bypasses (`playtera.in`), video search with pagination, and scheduled auto-posting. |
| **Promoter Bot 1** | Userbot | `Session 3` (`session_gen`) | `plugins_promoter_1` | 3-stage drip conversion funnel in DMs, group broadcasting, auto-admin elevation for `@ganeshmrxx`, and `/purge` command. |
| **Promoter Bot 2** | Userbot | `Session 4` (`x2`) | `plugins_promoter_2` | Independent replica scaling group broadcasting and DM funnel reach. |
| **Backup Forwarder** | Userbot | `Session 2` (`userClient1`) | `plugins_backup_forwarder` | Live & history channel mirroring via `xDataChannels` with duplicate registry `xData`. |
| **Data Modifier** | Bot Token | `token` (`xmodify1`) | `plugins_data_modifier` | Interactive media copy attaching inline `❌ Remove` button synchronized with Telegram & MongoDB. |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+ (tested with Python 3.14)
- Node.js 18+ and npm
- MongoDB Atlas access

### 2. Backend Installation & Startup
```bash
# Navigate to repository root
cd e:/Ganesh/ANIGRAVITY/allforward

# Activate Python virtual environment
.venv\Scripts\activate  # Windows
# source .venv/bin/activate # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI Backend & Bot Cluster
python api_server.py
```
*Backend runs on:* `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`)

### 3. Frontend Installation & Startup
```bash
# Navigate to frontend directory
cd e:/Ganesh/ANIGRAVITY/allforward/admin

# Install npm packages
npm install

# Start development server
npm run dev

# Or build for production
npm run build
npm start
```
*Frontend runs on:* `http://localhost:3000`

---

## 🔑 Default Credentials

- **Admin Username:** `admin` (Configure via `ADMIN_USERNAME` in `.env`)
- **Admin Password:** `admin` (Configure via `ADMIN_PASSWORD` in `.env`)
- **JWT Secret:** `supersecretkey123` (Configure via `ADMIN_SECRET` in `.env`)

---

## ⚙️ Environment Variables Reference

See `.env.example` for all configurable variables:

```env
# Backend Settings
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
ADMIN_SECRET=supersecretkey123
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000

# Frontend Settings
NEXT_PUBLIC_API_URL=http://localhost:8000

# MongoDB Clusters (Server-side Only)
MONGO_URI_A=mongodb+srv://g3cwork_db_user:g312345@cluster0.lpmpcya.mongodb.net/?retryWrites=true&w=majority
MONGO_URI_B=mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority
```

---

## 🗄️ MongoDB Database Architecture

### Cluster A (`Cluster0`)
1. **`chats`**: Channels/supergroups queued for sequential automated forwarding.
2. **`forward_progress`**: Last message ID scanned per chat for seamless resumption.
3. **`media_store`**: Unique media registry preventing duplicate message copies.
4. **`daily_summary`**: Aggregate daily metrics (`total_media`, `videos`, `photos`, `total_size`).

### Cluster B (`Cluster0`)
1. **`xDataChannels`**: Channel-to-channel routing map pairs (`source_id` ➔ `target`).
2. **`xData`**: Unique media index for Backup Forwarder with message ID mapping.
3. **`newMovieDatas2`**: Movie Forwarder deduplication index for files &gt;150MB.
4. **`terabotsearch`**: TeraBox search and channel interaction logs.

---

## 🛡️ Telegram Rate Limits & Safety Safeguards

1. **FloodWait Handling**: The system respects Telegram's rate-limiting automatically. When a `FloodWait` exception is encountered, workers pause safely until the cooldown window expires.
2. **Group Broadcasting Safety**: Promotional group broadcasting defaults to **DISABLED**. Enabling requires explicit operator confirmation via the UI to prevent account flags.
3. **No Credential Leakage**: Pyrogram string sessions, Telegram API hashes, bot tokens, and MongoDB URIs remain strictly server-side and are never transmitted to browser clients.

---

## 🛠️ Production Deployment Guide

### Single-Host Deployment with PM2 (Recommended)
Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js` in root:
```javascript
module.exports = {
  apps: [
    {
      name: "allforward-api",
      script: ".venv/Scripts/python.exe",
      args: "api_server.py",
      cwd: "e:/Ganesh/ANIGRAVITY/allforward",
      autorestart: true,
      env: {
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD: "your_strong_password",
        ADMIN_SECRET: "your_random_jwt_secret"
      }
    },
    {
      name: "allforward-ui",
      script: "npm",
      args: "start",
      cwd: "e:/Ganesh/ANIGRAVITY/allforward/admin",
      autorestart: true,
      env: {
        PORT: 3000,
        NEXT_PUBLIC_API_URL: "http://localhost:8000"
      }
    }
  ]
};
```

Start both services:
```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## 🩺 Diagnostics & Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| `AUTH_KEY_DUPLICATED` | Session string is running on multiple servers simultaneously. | Terminate rogue instances running locally or on another host. |
| `FloodWait` | Telegram rate limit triggered by rapid requests. | Let the worker sleep; do not repeatedly restart the bot. |
| `FROZEN_METHOD_INVALID` | Temporary Telegram flag on account (e.g. channel creation). | Wait 12–24 hours for Telegram to lift the automatic restriction. |
| `CHAT_ID_INVALID` | Userbot account has not joined the target chat. | Join the channel using the bot account or provide an invite link. |
| `401 Unauthorized` | Invalid credentials or expired JWT token. | Re-authenticate via `/login` using `ADMIN_USERNAME` and `ADMIN_PASSWORD`. |
