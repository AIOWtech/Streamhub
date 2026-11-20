# StreamHub

A hybrid live-streaming discovery and creator experience built with React, Vite, LiveKit and Vercel.

## Features
- Responsive live discovery interface and category filtering
- Creator studio with LiveKit WebRTC broadcasting and viewer sessions
- Server-side LiveKit access token generation
- YouTube and Twitch embed player support
- In-session chat UI and creator onboarding

## Local development
```bash
npm install
npm run dev
```

## LiveKit setup
Create a LiveKit project and configure these Vercel environment variables:
- `LIVEKIT_URL` — LiveKit WebSocket URL (wss://...)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The serverless endpoint at `/api/token` signs short-lived room tokens. Never expose the API secret in browser code.

## Deploy
Import this repository into Vercel or connect it to the StreamHub Vercel project. Vercel detects Vite automatically.

## Current MVP notes
Featured discovery cards are editorial placeholders until creators publish real rooms. YouTube/Twitch streams are embedded directly. Production accounts, persistent chat, moderation, stream directory synchronization and creator analytics require a database/auth service and are not represented as completed functionality.
