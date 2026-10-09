// ============================================
// Custom Server with Socket.IO
// ============================================

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const isProd = process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
const dev = !isProd;
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ============================================
// Room management
// ============================================

const rooms = new Map();
const playerToRoom = new Map();

const PLAYER_COLORS = ['#00e5ff', '#ff4081', '#76ff03', '#ffea00'];
const OBSTACLE_TYPES = ['train', 'barrier', 'cone', 'tall_barrier'];

// Mirrors DIFFICULTY_CONFIG in src/game/types.ts (plain JS copy for the socket server)
const DIFFICULTY = {
  easy: { gapMin: 560, gapMax: 980, doubleChance: 0.1 },
  medium: { gapMin: 430, gapMax: 810, doubleChance: 0.22 },
  hard: { gapMin: 350, gapMax: 650, doubleChance: 0.3 },
};

function parseDifficulty(value) {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : 'medium';
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateSeed() {
  return Math.floor(Math.random() * 1000000);
}

function generateObstacleSequence(seed, difficulty = 'medium', count = 500) {
  const spawns = [];
  const cfg = DIFFICULTY[parseDifficulty(difficulty)] || DIFFICULTY.medium;
  let rng = seed;

  function nextRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 700;
  for (let i = 0; i < count; i++) {
    const type = OBSTACLE_TYPES[Math.floor(nextRandom() * OBSTACLE_TYPES.length)];
    // Keep RNG order identical to src/game/engine.ts!
    const moving = type === 'train' && nextRandom() < 0.35;
    const lane = Math.floor(nextRandom() * 3);
    const gap = cfg.gapMin + nextRandom() * (cfg.gapMax - cfg.gapMin);

    spawns.push({ id: `obs_${i}`, type, lane, distance, moving });

    if (nextRandom() < cfg.doubleChance && i > 15) {
      const otherLane = ((lane + 1 + Math.floor(nextRandom() * 2)) % 3);
      spawns.push({
        id: `obs_${i}b`,
        type: OBSTACLE_TYPES[Math.floor(nextRandom() * OBSTACLE_TYPES.length)],
        lane: otherLane,
        distance: distance + 80 + nextRandom() * 80,
      });
    }
    distance += gap;
  }
  return spawns;
}

function generateCoinSequence(seed, count = 1000) {
  const spawns = [];
  let rng = seed + 9999;

  function nextRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  let distance = 300;
  for (let i = 0; i < count; i++) {
    const lane = Math.floor(nextRandom() * 3);
    const groupSize = 3 + Math.floor(nextRandom() * 4);
    for (let j = 0; j < groupSize; j++) {
      spawns.push({ id: `coin_${i}_${j}`, lane, distance: distance + j * 40 });
    }
    distance += 200 + nextRandom() * 400;
  }
  return spawns;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: '/api/socketio',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ================================
    // Create Room
    // ================================
    socket.on('room:create', (playerName, difficulty) => {
      const roomCode = generateRoomCode();
      const playerId = uuidv4();
      const seed = generateSeed();
      const roomDifficulty = parseDifficulty(difficulty);

      const room = {
        id: uuidv4(),
        code: roomCode,
        players: [
          {
            id: playerId,
            socketId: socket.id,
            name: playerName || 'Player 1',
            color: PLAYER_COLORS[0],
            isReady: false,
            score: 0,
            distance: 0,
            coins: 0,
            lane: 1,
            y: 420,
            state: 'running',
            isAlive: true,
          },
        ],
        maxPlayers: 4,
        isStarted: false,
        createdAt: Date.now(),
        hostId: playerId,
        seed,
        difficulty: roomDifficulty,
        obstacleSequence: generateObstacleSequence(seed, roomDifficulty),
        coinSequence: generateCoinSequence(seed),
      };

      rooms.set(roomCode, room);
      playerToRoom.set(socket.id, roomCode);
      socket.join(roomCode);

      console.log(`[Room] Created room ${roomCode} by ${playerName} (${roomDifficulty})`);
      socket.emit('room:created', room);
      socket.emit('room:joined', room, playerId);
    });

    // ================================
    // Join Room
    // ================================
    socket.on('room:join', (roomCode, playerName) => {
      const code = roomCode.toUpperCase().trim();
      const room = rooms.get(code);

      if (!room) {
        socket.emit('room:error', 'Room not found. Please check the code and try again.');
        return;
      }

      if (room.isStarted) {
        socket.emit('room:error', 'Game already in progress.');
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('room:error', 'Room is full (max 4 players).');
        return;
      }

      const playerId = uuidv4();
      const playerIndex = room.players.length;

      const player = {
        id: playerId,
        socketId: socket.id,
        name: playerName || `Player ${playerIndex + 1}`,
        color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
        isReady: false,
        score: 0,
        distance: 0,
        coins: 0,
        lane: 1,
        y: 420,
        state: 'running',
        isAlive: true,
      };

      room.players.push(player);
      playerToRoom.set(socket.id, code);
      socket.join(code);

      console.log(`[Room] ${playerName} joined room ${code}`);

      // Notify all players in the room
      socket.emit('room:joined', room, playerId);
      socket.to(code).emit('room:player-joined', player);
    });

    // ================================
    // Player Ready
    // ================================
    socket.on('room:ready', () => {
      const code = playerToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      player.isReady = true;
      io.to(code).emit('room:player-ready', player.id);

      console.log(`[Room] ${player.name} is ready in room ${code}`);

      // Check if all players are ready
      const allReady = room.players.every((p) => p.isReady);
      if (allReady && room.players.length >= 1) {
        // Start countdown
        let countdown = 3;
        const countdownInterval = setInterval(() => {
          io.to(code).emit('game:countdown', countdown);
          countdown--;
          if (countdown < 0) {
            clearInterval(countdownInterval);
            room.isStarted = true;
            // Reset all player states
            for (const p of room.players) {
              p.score = 0;
              p.distance = 0;
              p.coins = 0;
              p.lane = 1;
              p.isAlive = true;
              p.state = 'running';
            }
            io.to(code).emit('game:start', room);
            console.log(`[Game] Started in room ${code}`);
          }
        }, 1000);
      }
    });

    // ================================
    // Game Update (from player)
    // ================================
    socket.on('game:update', (data) => {
      const code = playerToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      // Update player data
      player.lane = data.lane;
      player.y = data.y;
      player.state = data.state;
      player.score = data.score;
      player.distance = data.distance;
      player.coins = data.coins;
      player.isAlive = data.isAlive;

      // Broadcast to other players
      socket.to(code).emit('game:player-update', player);
    });

    // ================================
    // Player Died
    // ================================
    socket.on('game:died', (finalScore) => {
      const code = playerToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      player.isAlive = false;
      player.score = finalScore;

      io.to(code).emit('game:player-died', player.id, finalScore);

      console.log(`[Game] ${player.name} died in room ${code} with score ${finalScore}`);

      // Check if all players are dead
      const allDead = room.players.every((p) => !p.isAlive);
      if (allDead) {
        const rankings = [...room.players].sort((a, b) => b.score - a.score);
        io.to(code).emit('game:over', rankings);
        room.isStarted = false;

        // Reset ready states
        for (const p of room.players) {
          p.isReady = false;
        }

        console.log(`[Game] Over in room ${code}`);
      }
    });

    // ================================
    // Disconnect
    // ================================
    socket.on('disconnect', () => {
      const code = playerToRoom.get(socket.id);
      if (code) {
        const room = rooms.get(code);
        if (room) {
          const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
          if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            io.to(code).emit('room:player-left', player.id);

            console.log(`[Socket] ${player.name} left room ${code}`);

            if (room.players.length === 0) {
              rooms.delete(code);
              console.log(`[Room] Deleted empty room ${code}`);
            }
          }
        }
        playerToRoom.delete(socket.id);
      }
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
