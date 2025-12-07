# ZugHug Loot Priority System

A web application for World of Warcraft Classic guilds to calculate and display loot priority scores for raid members.

## Features

- **Discord OAuth** - Sign in with Discord
- **Priority Leaderboard** - Sorted by calculated score
- **Score Components** - Attendance, performance, buffs, time since loot, loot penalty
- **Class Colors** - WoW class-colored player names
- **Filters** - Search, filter by class/role, hide PUGs
- **RaidLogger Integration** - Webhook endpoint for addon data

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Discord OAuth via Supabase
- **Hosting**: Vercel

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd zughug-priority
npm install
```

### 2. Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Warcraft Logs
WCL_CLIENT_ID=your-wcl-client-id
WCL_CLIENT_SECRET=your-wcl-client-secret

# RaidLogger Webhook
RAIDLOGGER_API_KEY=generate-a-random-string

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

Run the `supabase-schema.sql` file in your Supabase SQL Editor.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

### Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Environment Variables in Vercel

Add all variables from `.env.local` to Vercel's Environment Variables settings.

## API Endpoints

### RaidLogger Webhook

```
POST /api/raidlogger/webhook
```

Accepts raid data from the RaidLogger addon.

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "apiKey": "your-api-key",
  "zone": "Molten Core",
  "startTime": 1699999999999,
  "attendees": [...],
  "loot": [...],
  "buffs": [...]
}
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/callback/     # OAuth callback
│   │   └── raidlogger/webhook/ # Addon data endpoint
│   ├── dashboard/             # Main dashboard
│   ├── login/                 # Login page
│   └── layout.tsx             # Root layout
├── components/
│   ├── Header.tsx             # Navigation header
│   └── Leaderboard.tsx        # Score table
├── lib/
│   └── supabase/              # Supabase clients
└── types/
    └── database.ts            # TypeScript types
```

## License

MIT
