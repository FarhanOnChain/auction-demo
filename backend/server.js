'use strict';
/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║         AUCTION ARENA — DEMO SERVER                   ║
 * ║   No MongoDB · In-memory DB · Render-ready            ║
 * ╚═══════════════════════════════════════════════════════╝
 */

const http    = require('http');
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const { initDB } = require('./db');

// ── routes ───────────────────────────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const playerRoutes  = require('./routes/players');
const roomRoutes    = require('./routes/rooms');
const { setupWebSocket } = require('./websocket/handler');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 10000;

// ── middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/rooms',   roomRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', mode: 'demo (no MongoDB)', players: global.db?.players?.length ?? 0, time: new Date() })
);

// ── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'))
);

// ── boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await initDB();          // populates global.db with demo users + all players
  setupWebSocket(server);  // attaches WS to existing HTTP server

  server.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║       ⚡  AUCTION ARENA  DEMO           ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  HTTP  →  http://localhost:${PORT}       ║`);
    console.log(`║  WS    →  ws://localhost:${PORT}/ws      ║`);
    console.log('║                                        ║');
    console.log('║  👤  admin@auction.com / admin123       ║');
    console.log('║  👤  guest@auction.com / guest123       ║');
    console.log('╠════════════════════════════════════════╣');
    console.log('║  ⚡ Running in demo mode (no MongoDB)   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
  });
})();
