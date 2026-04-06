'use strict';
const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const { db }    = require('../db');
const { JWT_SECRET } = require('../routes/middleware');
const {
  startAuction, placeBid,
  pauseAuction, resumeAuction, skipPlayer,
} = require('../services/auctionService');

// ── connection registries ───────────────────────────────────────────────────
// roomId (string) → Set<WebSocket>
const roomClients = new Map();
// ws → { userId, username, role, roomId, teamId }
const clientMeta  = new Map();

// ── setup ───────────────────────────────────────────────────────────────────
function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch {
        safeSend(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      handle(ws, msg).catch(err => {
        console.error('[WS] handler error:', err.message);
        safeSend(ws, { type: 'error', message: err.message });
      });
    });

    ws.on('close', () => cleanup(ws));
    ws.on('error', err => console.error('[WS] socket error:', err.message));

    safeSend(ws, { type: 'connected', message: 'Connected to AuctionArena' });
  });

  // heartbeat — kick dead sockets every 30 s
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  return wss;
}

// ── message dispatcher ──────────────────────────────────────────────────────
async function handle(ws, msg) {
  const { type, token } = msg;

  // authenticate
  let user = null;
  if (token) {
    try { user = jwt.verify(token, JWT_SECRET); } catch {
      safeSend(ws, { type: 'error', message: 'Invalid token' });
      return;
    }
  }

  switch (type) {

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    case 'join_room': {
      if (!user) { safeSend(ws, { type: 'error', message: 'Auth required' }); return; }

      const { roomCode } = msg;
      const room = db.findOne('rooms', r => r.code === (roomCode || '').toUpperCase());
      if (!room) { safeSend(ws, { type: 'error', message: 'Room not found' }); return; }

      const part = (room.participants || []).find(p => p.userId === user.id);
      const teamId = part?.teamId || null;

      // register
      const rid = room._id;
      if (!roomClients.has(rid)) roomClients.set(rid, new Set());
      roomClients.get(rid).add(ws);
      clientMeta.set(ws, { userId: user.id, username: user.username, role: user.role, roomId: rid, teamId });

      // build teams snapshot
      const teams = buildTeamsSnapshot(room);
      const myTeam = teamId ? teams.find(t => t.id === teamId) : null;

      // current player if in-flight
      const currentPlayer = room.currentPlayer ? db.findById('players', room.currentPlayer) : null;

      safeSend(ws, {
        type: 'room_state',
        room: {
          id: room._id, name: room.name, sport: room.sport,
          status: room.status, settings: room.settings,
          currentPlayer, currentBid: room.currentBid,
        },
        teams,
        myTeamId:  teamId,
        isAdmin:   room.admin === user.id || user.role === 'admin',
      });

      broadcast(rid, { type: 'user_joined', username: user.username }, ws);
      break;
    }

    // ── PLACE BID ────────────────────────────────────────────────────────────
    case 'place_bid': {
      if (!user) { safeSend(ws, { type: 'error', message: 'Auth required' }); return; }
      const meta = clientMeta.get(ws);
      if (!meta) { safeSend(ws, { type: 'error', message: 'Not in a room' }); return; }

      try {
        const result = await placeBid(meta.roomId, user.id, meta.teamId, Number(msg.amount));
        const room   = db.findById('rooms', meta.roomId);
        const player = db.findById('players', room.currentPlayer);
        const team   = db.findById('teams', meta.teamId);

        broadcast(meta.roomId, {
          type: 'bid_placed',
          bid: {
            amount:      result.bid.amount,
            bidderName:  user.username,
            teamId:      meta.teamId,
            teamName:    team?.name,
            playerName:  player?.name,
            timerEnd:    result.bid.timerEnd,
          },
        });
      } catch (err) {
        safeSend(ws, { type: 'bid_error', message: err.message });
      }
      break;
    }

    // ── ADMIN: START ─────────────────────────────────────────────────────────
    case 'admin_start': {
      if (!user) { safeSend(ws, { type: 'error', message: 'Auth required' }); return; }
      const meta = clientMeta.get(ws);
      if (!meta)  { safeSend(ws, { type: 'error', message: 'Not in a room' }); return; }

      const room = db.findById('rooms', meta.roomId);
      if (!room)                        { safeSend(ws, { type: 'error', message: 'Room not found' }); return; }
      if (room.admin !== user.id && user.role !== 'admin')
                                        { safeSend(ws, { type: 'error', message: 'Admin only' }); return; }
      if (room.status !== 'waiting')    { safeSend(ws, { type: 'error', message: 'Room already started' }); return; }
      if ((room.teams || []).length < 1){ safeSend(ws, { type: 'error', message: 'Need at least 1 team' }); return; }

      await startAuction(meta.roomId, auctionEventHandler);
      broadcast(meta.roomId, { type: 'auction_started' });
      break;
    }

    // ── ADMIN: PAUSE ─────────────────────────────────────────────────────────
    case 'admin_pause': {
      const meta = clientMeta.get(ws);
      if (!meta) return;
      const room = db.findById('rooms', meta.roomId);
      if (room && (room.admin === user?.id || user?.role === 'admin')) {
        await pauseAuction(meta.roomId);
        broadcast(meta.roomId, { type: 'auction_paused' });
      }
      break;
    }

    // ── ADMIN: RESUME ────────────────────────────────────────────────────────
    case 'admin_resume': {
      const meta = clientMeta.get(ws);
      if (!meta) return;
      const room = db.findById('rooms', meta.roomId);
      if (room && (room.admin === user?.id || user?.role === 'admin')) {
        await resumeAuction(meta.roomId);
        broadcast(meta.roomId, { type: 'auction_resumed' });
      }
      break;
    }

    // ── ADMIN: SKIP ──────────────────────────────────────────────────────────
    case 'admin_skip': {
      const meta = clientMeta.get(ws);
      if (!meta) return;
      const room = db.findById('rooms', meta.roomId);
      if (room && (room.admin === user?.id || user?.role === 'admin')) {
        await skipPlayer(meta.roomId);
      }
      break;
    }

    case 'ping':
      safeSend(ws, { type: 'pong', timestamp: Date.now() });
      break;

    default:
      safeSend(ws, { type: 'error', message: `Unknown message type: ${type}` });
  }
}

// ── auction event → WS broadcast ────────────────────────────────────────────
function auctionEventHandler(roomId, event, payload) {
  switch (event) {

    case 'next_player':
      broadcast(roomId, {
        type:     'next_player',
        player:   payload.player,
        timerEnd: payload.timerEnd,
        bidTimer: payload.bidTimer,
      });
      // also push updated team budgets
      sendTeamsUpdate(roomId);
      break;

    case 'player_sold':
      broadcast(roomId, {
        type:   'player_sold',
        player: payload.player,
        team:   payload.team,
        amount: payload.amount,
      });
      sendTeamsUpdate(roomId);
      break;

    case 'player_unsold':
      broadcast(roomId, {
        type:   'player_unsold',
        player: payload.player,
      });
      break;

    case 'auction_complete':
      broadcast(roomId, { type: 'auction_complete', message: 'Auction complete!' });
      break;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function sendTeamsUpdate(roomId) {
  const room = db.findById('rooms', roomId);
  if (!room) return;
  broadcast(roomId, { type: 'teams_update', teams: buildTeamsSnapshot(room) });
}

function buildTeamsSnapshot(room) {
  return (room.teams || []).map(tid => {
    const team  = db.findById('teams', tid);
    if (!team) return null;
    const owner = db.findById('users', team.owner);
    return {
      id:              team._id,
      name:            team.name,
      owner:           owner?.username || '',
      ownerId:         team.owner,
      budgetRemaining: team.budgetRemaining,
      budget:          team.budget,
      playerCount:     (team.players || []).length,
      color:           team.color,
      players: (team.players || []).map(e => {
        const p = db.findById('players', e.playerId);
        return p ? { name: p.name, position: p.position, pricePaid: e.pricePaid } : null;
      }).filter(Boolean),
    };
  }).filter(Boolean);
}

function cleanup(ws) {
  const meta = clientMeta.get(ws);
  if (meta?.roomId) {
    const set = roomClients.get(meta.roomId);
    if (set) set.delete(ws);
    broadcast(meta.roomId, { type: 'user_left', username: meta.username }, ws);
  }
  clientMeta.delete(ws);
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(roomId, msg, exclude = null) {
  const clients = roomClients.get(String(roomId));
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastToRoom(roomId, msg) { broadcast(roomId, msg); }

module.exports = { setupWebSocket, broadcastToRoom };
