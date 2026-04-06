'use strict';
/**
 * Core auction engine — zero database calls.
 * All state lives in global.db.rooms / global.db.teams / global.db.bids.
 */

const { db, id } = require('../db');

// ── per-room timer handles ──────────────────────────────────────────────────
const timers    = new Map();   // roomId -> setTimeout handle
const callbacks = new Map();   // roomId -> onEvent(roomId, event, payload)

// ── game rules ─────────────────────────────────────────────────────────────
const RULES = {
  cricket:  { teamSize: 18, budget: 120_000_000 },
  football: { teamSize: 23, budget: 200_000_000 },
};

// ── helpers ─────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emit(roomId, event, payload = {}) {
  const cb = callbacks.get(String(roomId));
  if (cb) cb(roomId, event, payload);
}

function clearRoomTimer(roomId) {
  const h = timers.get(String(roomId));
  if (h) { clearTimeout(h); timers.delete(String(roomId)); }
}

function startTimer(roomId, seconds) {
  clearRoomTimer(roomId);
  const h = setTimeout(() => handleExpiry(String(roomId)), seconds * 1000);
  timers.set(String(roomId), h);
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * startAuction(roomId, onEvent)
 * onEvent(roomId, eventName, payload)
 *   events: 'next_player' | 'player_sold' | 'player_unsold' | 'auction_complete'
 */
async function startAuction(roomId, onEvent) {
  const room = db.findById('rooms', roomId);
  if (!room) throw new Error('Room not found');

  // build shuffled auction order from room's unsold players
  const order = shuffle(room.playerIds || []);

  db.update('rooms', roomId, {
    auctionOrder:       order,
    currentPlayerIndex: 0,
    status:             'active',
  });

  callbacks.set(String(roomId), onEvent);
  advancePlayer(roomId);
}

function advancePlayer(roomId) {
  const room = db.findById('rooms', roomId);
  if (!room || room.status !== 'active') return;

  // find next unsold player in auction order
  let idx = room.currentPlayerIndex;
  while (idx < room.auctionOrder.length) {
    const pid   = room.auctionOrder[idx];
    const player = db.findById('players', pid);
    if (player && !player.soldTo) break;
    idx++;
  }

  if (idx >= room.auctionOrder.length) {
    // ── auction complete ──
    db.update('rooms', roomId, { status: 'completed', completedAt: new Date() });
    emit(roomId, 'auction_complete', {});
    return;
  }

  const player = db.findById('players', room.auctionOrder[idx]);
  const bidTimer = room.settings?.bidTimer || 30;
  const timerEnd = new Date(Date.now() + bidTimer * 1000);

  db.update('rooms', roomId, {
    currentPlayerIndex: idx,
    currentPlayer:      player._id,
    currentBid: { amount: 0, bidder: null, team: null, timerEnd },
  });

  emit(roomId, 'next_player', { player, timerEnd, bidTimer });
  startTimer(roomId, bidTimer);
}

async function handleExpiry(roomId) {
  const room = db.findById('rooms', roomId);
  if (!room || room.status !== 'active') return;

  const { currentBid, currentPlayer: pid } = room;
  const player = pid ? db.findById('players', pid) : null;

  if (currentBid?.team && currentBid.amount > 0 && player) {
    // ── sell ──
    finaliseSale(roomId, player, currentBid);
  } else if (player) {
    emit(roomId, 'player_unsold', { player });
  }

  // advance
  const fresh = db.findById('rooms', roomId);
  if (fresh && fresh.status === 'active') {
    db.update('rooms', roomId, { currentPlayerIndex: (fresh.currentPlayerIndex || 0) + 1 });
    advancePlayer(roomId);
  }
}

function finaliseSale(roomId, player, bid) {
  // mark player sold
  db.update('players', player._id, { soldTo: bid.team, soldPrice: bid.amount });

  // update winning team
  const team = db.findById('teams', bid.team);
  if (team) {
    db.update('teams', bid.team, {
      budgetRemaining: team.budgetRemaining - bid.amount,
      players: [...(team.players || []), { playerId: player._id, pricePaid: bid.amount }],
    });
  }

  // record bid
  db.insert('bids', {
    room:      roomId,
    player:    player._id,
    bidder:    bid.bidder,
    team:      bid.team,
    amount:    bid.amount,
    isWinning: true,
    timestamp: new Date(),
  });

  const winTeam = db.findById('teams', bid.team);
  const owner   = winTeam ? db.findById('users', winTeam.owner) : null;

  emit(roomId, 'player_sold', {
    player,
    team:   { id: bid.team, name: winTeam?.name, owner: owner?.username },
    amount: bid.amount,
  });
}

/**
 * placeBid(roomId, userId, teamId, amount) → throws on validation failure
 */
async function placeBid(roomId, userId, teamId, amount) {
  const room = db.findById('rooms', roomId);
  if (!room)                   throw new Error('Room not found');
  if (room.status !== 'active') throw new Error('Auction is not active');

  const team = db.findById('teams', teamId);
  if (!team)                        throw new Error('Team not found');
  if (team.owner !== String(userId)) throw new Error('Not your team');

  const player = room.currentPlayer ? db.findById('players', room.currentPlayer) : null;
  if (!player) throw new Error('No player currently up for auction');

  const rules  = RULES[room.sport] || RULES.cricket;
  const minInc = room.settings?.minBidIncrement || 100_000;
  const minBid = room.currentBid?.amount > 0
    ? room.currentBid.amount + minInc
    : player.basePrice;

  if (amount < minBid)              throw new Error(`Minimum bid is ${fmt(minBid)}`);
  if (amount > team.budgetRemaining) throw new Error(`Insufficient budget (${fmt(team.budgetRemaining)} remaining)`);
  if ((team.players || []).length >= rules.teamSize) throw new Error('Your team is full');

  const bidTimer = room.settings?.bidTimer || 30;
  const timerEnd = new Date(Date.now() + bidTimer * 1000);

  db.update('rooms', roomId, {
    currentBid: { amount, bidder: userId, team: teamId, timerEnd },
  });

  // reset countdown
  startTimer(roomId, bidTimer);

  // record bid (non-winning for now)
  db.insert('bids', {
    room: roomId, player: player._id, bidder: userId, team: teamId,
    amount, isWinning: false, timestamp: new Date(),
  });

  return { success: true, bid: { amount, team: teamId, player: player._id, timerEnd } };
}

async function pauseAuction(roomId) {
  clearRoomTimer(roomId);
  db.update('rooms', roomId, { status: 'paused' });
}

async function resumeAuction(roomId) {
  const room = db.findById('rooms', roomId);
  if (!room) return;
  const secLeft = room.currentBid?.timerEnd
    ? Math.max(5, Math.floor((new Date(room.currentBid.timerEnd) - Date.now()) / 1000))
    : room.settings?.bidTimer || 30;
  db.update('rooms', roomId, { status: 'active' });
  startTimer(roomId, secLeft);
}

async function skipPlayer(roomId) {
  clearRoomTimer(roomId);
  const room = db.findById('rooms', roomId);
  if (!room) return;
  const player = room.currentPlayer ? db.findById('players', room.currentPlayer) : null;
  if (player) emit(roomId, 'player_unsold', { player });
  db.update('rooms', roomId, { currentPlayerIndex: (room.currentPlayerIndex || 0) + 1 });
  advancePlayer(roomId);
}

function fmt(n) {
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

module.exports = { startAuction, placeBid, pauseAuction, resumeAuction, skipPlayer, clearRoomTimer };
