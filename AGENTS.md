# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Real-time messaging web application ("Messagerie instantanée") built with Node.js backend and vanilla JavaScript frontend. Features include text messaging, voice messages with waveform visualization, image sharing, message reactions, video conferencing (WebRTC), and user profiles.

## Commands

```powershell
# Install dependencies
npm install

# Run development server (with hot reload via nodemon)
npm run dev

# Run production server
npm run start
```

The server starts on port 3000 (or `$env:PORT`). Memory is limited to 460MB (`--max-old-space-size=460`) with exposed garbage collection (`--expose-gc`).

## Architecture

### Backend (`server.js`)
Single-file Express server handling:
- **Socket.IO events**: `chat message`, `message reaction`, `typing`, `recording`, `update profile`, `get group info`, WebRTC signaling (`join-room`, `offer`, `answer`, `ice-candidate`)
- **SQLite database**: `database.sqlite` with tables `messages` and `group_info`
- **Auto-cleanup**: Messages older than 7 days or beyond 200 total are purged hourly

### Frontend (`public/`)
- `index.html` - Home/lobby page for username selection and group list
- `Groupe.html` - Main chat room (uses `script.js`)
- `profil.html` - User profile management
- `groupe-profil.html` - Group settings
- `visio.html` - WebRTC video conferencing room

### Key JavaScript Modules (`public/js/`)
- `script.js` - Main chat logic: message rendering, reactions, context menu, voice recording with MediaRecorder API, local message caching
- `common.js` - Shared utilities: `getColorForUser()`, `getUserId()`
- `media-optimizer.js` - Image compression before upload
- `audio-recorder.js` - Audio recording helpers
- `memory-manager.js` - Client-side memory optimization

### Data Flow
1. Client connects via Socket.IO → receives `load history` (last 100 messages)
2. Messages stored server-side in SQLite + client-side in localStorage (max 50 messages, 24h expiration)
3. Profile/group updates broadcast to all connected clients
4. Voice messages: recorded as WebM/MP4 blob → converted to base64 → stored with waveform data

## Technical Constraints

- Node.js 18+ required (`.nvmrc`: 18.20.0)
- SQLite WAL mode enabled for concurrent access
- Audio MIME type selection: `audio/webm` (Android/PC) or `audio/mp4` (iOS)
- Images compressed client-side before sending (max 10MB input, optimized via `MediaOptimizer`)
- All comments and UI text are in French
