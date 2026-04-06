'use strict';
const express = require('express');
const router  = express.Router();
const { db, id } = require('../db');
const { authMiddleware, adminMiddleware } = require('./middleware');

/* GET /api/players */
router.get('/', (req, res) => {
  try {
    const { sport, position, page = 1, limit = 100 } = req.query;
    let players = db.findAll('players', p => p.isActive);
    if (sport)    players = players.filter(p => p.sport === sport);
    if (position) players = players.filter(p => p.position === position);
    players.sort((a, b) => b.rating - a.rating);
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paged = players.slice(start, start + parseInt(limit));
    res.json({ players: paged, total: players.length, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/players/positions — list available positions for a sport */
router.get('/positions', (req, res) => {
  const { sport } = req.query;
  const positions = {
    cricket:  ['Batsman', 'WK', 'All-rounder', 'Pacer', 'Spinner'],
    football: ['GK', 'Defender', 'Midfielder', 'Forward'],
  };
  res.json({ positions: sport ? (positions[sport] || []) : positions });
});

/* POST /api/players/sync — simulated sync (returns demo confirmation) */
router.post('/sync', authMiddleware, adminMiddleware, (req, res) => {
  const { sport } = req.body;
  const counts = {};
  if (sport === 'cricket' || sport === 'both')
    counts.cricket = { total: db.count('players', p => p.sport === 'cricket'), inserted: 0, updated: 0 };
  if (sport === 'football' || sport === 'both')
    counts.football = { total: db.count('players', p => p.sport === 'football'), inserted: 0, updated: 0 };
  res.json({ message: `Demo mode: ${db.count('players')} players already in memory`, results: counts });
});

/* POST /api/players/manual — add one player */
router.post('/manual', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, sport, position, team, nationality, age, rating, basePrice, stats } = req.body;
    if (!name || !sport || !position)
      return res.status(400).json({ error: 'name, sport, position are required' });

    const derived = basePrice
      ? Number(basePrice)
      : sport === 'football'
        ? (rating >= 87 ? 10000000 : rating >= 78 ? 5000000 : 1000000)
        : (rating >= 85 ? 2000000  : rating >= 70 ? 1000000  : 200000);

    const player = db.insert('players', {
      name, sport, position,
      team: team || '',
      nationality: nationality || '',
      age: age ? Number(age) : null,
      rating: rating ? Number(rating) : 70,
      basePrice: derived,
      stats: stats || {},
      imageUrl: '',
      source: 'manual',
      isActive: true,
      soldTo: null,
      soldPrice: null,
    });
    res.json({ player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/players/manual/bulk */
router.post('/manual/bulk', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { players } = req.body;
    if (!Array.isArray(players))
      return res.status(400).json({ error: 'players array required' });

    let inserted = 0;
    const errors = [];
    for (const p of players) {
      try {
        db.insert('players', { ...p, source: 'manual', isActive: true });
        inserted++;
      } catch (e) {
        errors.push({ name: p.name, error: e.message });
      }
    }
    res.json({ inserted, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/players/:id */
router.put('/:pid', authMiddleware, adminMiddleware, (req, res) => {
  const player = db.update('players', req.params.pid, req.body);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json({ player });
});

/* DELETE /api/players/:id */
router.delete('/:pid', authMiddleware, adminMiddleware, (req, res) => {
  const ok = db.remove('players', req.params.pid);
  if (!ok) return res.status(404).json({ error: 'Player not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
