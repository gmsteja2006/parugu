# 🏃 Neon Runner — Multiplayer Endless Runner

A real-time multiplayer endless runner game built with Next.js, Canvas 2D, and Socket.IO. Race against friends, dodge obstacles, collect coins, and compete for the highest score!

## ✨ Features

- **Endless Runner Gameplay**: Auto-running character with 3-lane movement, jumping, and sliding
- **Real-time Multiplayer**: Up to 4 players per room via Socket.IO WebSockets
- **Room System**: Create or join rooms with unique 5-character codes
- **Live Leaderboard**: See all players' scores updated in real-time
- **Procedural Generation**: Deterministic obstacle/coin sequences shared across all players
- **Neon Aesthetics**: Dark theme with vibrant neon colors, particle effects, and pseudo-3D rendering
- **Sound Effects**: Procedural audio via Web Audio API (no external files needed)
- **Mobile Support**: Touch/swipe controls for mobile devices

## 🎮 Controls

| Action     | Keyboard           | Mobile       |
|------------|--------------------| -------------|
| Move Left  | `←` or `A`         | Swipe Left   |
| Move Right | `→` or `D`         | Swipe Right  |
| Jump       | `↑` or `W` or `Space` | Swipe Up  |
| Slide      | `↓` or `S`         | Swipe Down   |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd running_game

# Install dependencies
npm install

# Start the development server
npm run dev
```

The game will be available at **http://localhost:3000**

### How to Play Multiplayer

1. Open `http://localhost:3000` in your browser
2. Enter your name and click **Create Room**
3. Share the **5-character room code** with friends
4. Friends open the same URL, enter their name, and click **Join Room**
5. Everyone clicks **Ready Up**
6. After the countdown, the race begins!

## 🏗️ Tech Stack

| Technology    | Purpose                          |
|---------------|----------------------------------|
| Next.js 16    | Full-stack React framework       |
| React 19      | UI components                    |
| Canvas 2D     | Game rendering                   |
| Socket.IO     | Real-time multiplayer            |
| TailwindCSS 4 | UI styling                       |
| Web Audio API | Procedural sound effects         |
| TypeScript    | Type safety                      |

## 📁 Project Structure

```
running_game/
├── server.js                    # Custom server (Next.js + Socket.IO)
├── vercel.json                  # Vercel deployment config
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with fonts & meta
│   │   ├── page.tsx             # Entry point
│   │   └── globals.css          # Global styles & animations
│   ├── components/
│   │   ├── GameView.tsx         # Main orchestrator (phases)
│   │   ├── StartScreen.tsx      # Create/Join room screen
│   │   ├── Lobby.tsx            # Room lobby
│   │   ├── GameCanvas.tsx       # Canvas game component
│   │   ├── Scoreboard.tsx       # In-game HUD
│   │   ├── GameOver.tsx         # End screen with rankings
│   │   └── CountdownOverlay.tsx # Pre-game countdown
│   ├── game/
│   │   ├── types.ts             # Game types & constants
│   │   ├── engine.ts            # Game physics & logic
│   │   ├── renderer.ts          # Canvas 2D renderer
│   │   └── sounds.ts            # Web Audio sound effects
│   └── lib/
│       └── socket.ts            # Socket.IO client singleton
└── package.json
```

## 🌐 Deployment

### Vercel (Recommended)

> **Note:** Vercel's serverless functions have limitations with persistent WebSocket connections. For production multiplayer, consider deploying the Socket.IO server separately on Railway, Render, or Fly.io.

```bash
# Build for production
npm run build

# The vercel.json is pre-configured
vercel deploy
```

### Self-Hosted

```bash
npm run build
npm start
```

## 🎨 Game Design

- **Pseudo-3D**: Perspective projection on Canvas 2D for a depth effect
- **Dynamic Buildings**: Procedurally generated cityscape background
- **Star Field**: Twinkling stars with parallax
- **Particle System**: Dust particles, coin sparkles, and crash effects
- **Speed Lines**: Visual speed indicators at higher velocities
- **Vignette**: Cinematic edge darkening

## 📝 License

MIT
