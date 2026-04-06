'use strict';
const express = require('express');
const router  = express.Router();
const { db, id } = require('../db');
const { authMiddleware, adminMiddleware } = require('./middleware');

const RULES = {
  cricket:  { teamSize: 18, budget: 120_000_000, requiredPositions: { Batsman: 1, WK: 1, 'All-rounder': 1, Pacer: 1, Spinner: 1 } },
  football: { teamSize: 23, budget: 200_000_000, requiredPositions: { GK: 1, Defender: 1, Midfielder: 1, Forward: 1 } },
};

function generateCode() {
  let code;
  do { code = Math.random().toString(36).substring(2, 8).toUpperCase(); }
  while (db.findOne('rooms', r => r.code === code));
  return code;
}

// ─── Helpers to hydrate rooms for API responses ───────────────────────────────

function hydrateRoom(room) {
  if (!room) return null;
  const adminUser = db.findById('users', room.admin);
  return {
    ...room,
    admin: adminUser ? { _id: adminUser._id, username: adminUser.username } : room.admin,
    teams: (room.teams || []).map(tid => hydrateTeam(db.findById('teams', tid))).filter(Boolean),
    currentPlayer: room.currentPlayer ? db.findById('players', room.currentPlayer) : null,
  };
}

function hydrateTeam(team) {
  if (!team) return null;
  const owner = db.findById('users', team.owner);
  return {
    ...team,
    owner: owner ? { _id: owner._id, username: owner.username } : team.owner,
    players: (team.players || []).map(entry => ({
      player: db.findById('players', entry.playerId),
      pricePaid: entry.pricePaid,
    })).filter(e => e.player),
  };
}

// ─── POST /api/rooms ──────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, sport, mode = 'auto', settings = {} } = req.body;
    if (!name || !sport) return res.status(400).json({ error: 'name and sport required' });
    if (!RULES[sport])   return res.status(400).json({ error: 'sport must be cricket or football' });

    const rules = RULES[sport];
    const roomBudget = settings.teamBudget || rules.budget;

    const room = db.insert('rooms', {
      name,
      code: generateCode(),
      sport,
      mode,
      admin: req.user.id,
      status: 'waiting',
      settings: {
        maxTeams:        settings.maxTeams        || 8,
        teamBudget:      roomBudget,
        bidTimer:        settings.bidTimer        || 30,
        minBidIncrement: settings.minBidIncrement || 100_000,
        teamSize:        settings.teamSize        || rules.teamSize,
      },
      // all active unsold players of the right sport
      playerIds:          db.findAll('players', p => p.sport === sport && p.isActive).map(p => p._id),
      auctionOrder:       [],
      currentPlayerIndex: 0,
      currentPlayer:      null,
      currentBid:         { amount: 0, bidder: null, team: null, timerEnd: null },
      teams:              [],
      participants:       [],
      completedAt:        null,
    });

    // auto-create the creator's team
    const team = db.insert('teams', {
      name:            `${req.user.username}'s Team`,
      owner:           req.user.id,
      room:            room._id,
      sport,
      budget:          roomBudget,
      budgetRemaining: roomBudget,
      color:           randomColor(),
      players:         [],          // array of { playerId, pricePaid }
      positionsFilled: {},
    });

    db.update('rooms', room._id, {
      teams:        [team._id],
      participants: [{ userId: req.user.id, teamId: team._id }],
    });

    res.json({ room: { id: room._id, code: room.code, name: room.name, sport, mode }, team: hydrateTeam(team) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rooms/code/:code ────────────────────────────────────────────────
router.get('/code/:code', authMiddleware, (req, res) => {
  const room = db.findOne('rooms', r => r.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room: hydrateRoom(room) });
});

// ─── GET /api/rooms/:id ───────────────────────────────────────────────────────
router.get('/:rid', authMiddleware, (req, res) => {
  const room = db.findById('rooms', req.params.rid);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room: hydrateRoom(room) });
});

// ─── POST /api/rooms/:code/join ───────────────────────────────────────────────
router.post('/:code/join', authMiddleware, (req, res) => {
  try {
    const room = db.findOne('rooms', r => r.code === req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'waiting') return res.status(400).json({ error: 'Room is no longer accepting players' });

    // already joined?
    const existing = room.participants.find(p => p.userId === req.user.id);
    if (existing) {
      const team = db.findById('teams', existing.teamId);
      return res.json({ message: 'Already joined', team: hydrateTeam(team) });
    }

    if (room.teams.length >= room.settings.maxTeams)
      return res.status(400).json({ error: 'Room is full' });

    const { teamName, color } = req.body;
    const team = db.insert('teams', {
      name:            teamName || `${req.user.username}'s Team`,
      owner:           req.user.id,
      room:            room._id,
      sport:           room.sport,
      budget:          room.settings.teamBudget,
      budgetRemaining: room.settings.teamBudget,
      color:           color || randomColor(),
      players:         [],
      positionsFilled: {},
    });

    db.update('rooms', room._id, {
      teams:        [...room.teams, team._id],
      participants: [...room.participants, { userId: req.user.id, teamId: team._id }],
    });

    // broadcast via WS (imported lazily to avoid circular deps)
    try { require('../websocket/handler').broadcastToRoom(room._id, { type: 'team_joined', team: hydrateTeam(team) }); } catch {}

    res.json({ message: 'Joined', team: hydrateTeam(team) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rooms (admin) ───────────────────────────────────────────────────
router.get('/', authMiddleware, adminMiddleware, (req, res) => {
  const rooms = db.findAll('rooms').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ rooms: rooms.map(hydrateRoom) });
});

// ─── PUT /api/rooms/:id (admin / room owner) ──────────────────────────────────
router.put('/:rid', authMiddleware, (req, res) => {
  const room = db.findById('rooms', req.params.rid);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.admin !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Not authorized' });
  if (room.status !== 'waiting')
    return res.status(400).json({ error: 'Cannot edit an active room' });

  const updated = db.update('rooms', room._id, {
    name:     req.body.name     || room.name,
    mode:     req.body.mode     || room.mode,
    settings: { ...room.settings, ...(req.body.settings || {}) },
  });
  res.json({ room: hydrateRoom(updated) });
});

// ─── GET /api/rooms/:id/results ───────────────────────────────────────────────
router.get('/:rid/results', authMiddleware, (req, res) => {
  const room = db.findById('rooms', req.params.rid);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const teams = (room.teams || []).map(tid => hydrateTeam(db.findById('teams', tid))).filter(Boolean);
  res.json({ teams });
});

function randomColor() {
  const palette = ['#e63946','#4cc9f0','#06d6a0','#f4a261','#a8dadc','#9b5de5','#f15bb5','#fee440','#00bbf9','#00f5d4'];
  return palette[Math.floor(Math.random() * palette.length)];
}

module.exports = router;
