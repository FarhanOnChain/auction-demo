'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db, id } = require('../db');
const { JWT_SECRET } = require('./middleware');

/* POST /api/auth/register */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'username, email and password are required' });

    if (db.findOne('users', u => u.email === email))
      return res.status(400).json({ error: 'Email already registered' });
    if (db.findOne('users', u => u.username === username))
      return res.status(400).json({ error: 'Username already taken' });

    const hashed = await bcrypt.hash(password, 10);
    const user = db.insert('users', {
      _id: id(),
      username,
      email: email.toLowerCase(),
      password: hashed,
      role: role === 'admin' ? 'admin' : 'user',
      stats: { gamesPlayed: 0, wins: 0, totalSpent: 0 },
    });

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = db.findOne('users', u => u.email === email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
