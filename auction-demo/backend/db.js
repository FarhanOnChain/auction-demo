'use strict';
/**
 * =====================================================
 *  AUCTION ARENA — IN-MEMORY DATABASE
 *  No MongoDB required. All data lives in process memory.
 *  Pre-loaded with 46 IPL + 52 UCL players and one admin.
 * =====================================================
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ─── helper ──────────────────────────────────────────
function id() { return uuidv4(); }

// ─── CRICKET PLAYERS (46) ────────────────────────────
function cricketPlayers() {
  const raw = [
    // Batsmen
    ['Virat Kohli',       'Batsman',     'Royal Challengers Bangalore', 'India',        35, 95],
    ['Rohit Sharma',      'Batsman',     'Mumbai Indians',              'India',        37, 93],
    ['Suryakumar Yadav',  'Batsman',     'Mumbai Indians',              'India',        33, 90],
    ['Shubman Gill',      'Batsman',     'Gujarat Titans',              'India',        24, 85],
    ['Faf du Plessis',    'Batsman',     'Royal Challengers Bangalore', 'South Africa', 39, 84],
    ['David Warner',      'Batsman',     'Delhi Capitals',              'Australia',    37, 85],
    ['Yashasvi Jaiswal',  'Batsman',     'Rajasthan Royals',            'India',        22, 83],
    ['Travis Head',       'Batsman',     'Sunrisers Hyderabad',         'Australia',    30, 84],
    ['Ruturaj Gaikwad',   'Batsman',     'Chennai Super Kings',         'India',        27, 79],
    ['Prithvi Shaw',      'Batsman',     'Delhi Capitals',              'India',        24, 73],
    ['Devdutt Padikkal',  'Batsman',     'Rajasthan Royals',            'India',        23, 70],
    ['Rinku Singh',       'Batsman',     'Kolkata Knight Riders',       'India',        26, 72],
    ['Tilak Varma',       'Batsman',     'Mumbai Indians',              'India',        21, 75],

    // Wicket Keepers
    ['KL Rahul',          'WK',          'Lucknow Super Giants',        'India',        32, 88],
    ['Jos Buttler',       'WK',          'Rajasthan Royals',            'England',      33, 88],
    ['Quinton de Kock',   'WK',          'Lucknow Super Giants',        'South Africa', 31, 84],
    ['Heinrich Klaasen',  'WK',          'Sunrisers Hyderabad',         'South Africa', 32, 82],
    ['Sanju Samson',      'WK',          'Rajasthan Royals',            'India',        29, 80],
    ['Ishan Kishan',      'WK',          'Mumbai Indians',              'India',        25, 78],

    // All-rounders
    ['Hardik Pandya',     'All-rounder', 'Mumbai Indians',              'India',        30, 88],
    ['Ben Stokes',        'All-rounder', 'Chennai Super Kings',         'England',      32, 90],
    ['Ravindra Jadeja',   'All-rounder', 'Chennai Super Kings',         'India',        35, 88],
    ['Andre Russell',     'All-rounder', 'Kolkata Knight Riders',       'West Indies',  36, 87],
    ['Glenn Maxwell',     'All-rounder', 'Royal Challengers Bangalore', 'Australia',    35, 85],
    ['Sunil Narine',      'All-rounder', 'Kolkata Knight Riders',       'West Indies',  35, 84],
    ['Axar Patel',        'All-rounder', 'Delhi Capitals',              'India',        30, 80],
    ['Marcus Stoinis',    'All-rounder', 'Lucknow Super Giants',        'Australia',    34, 78],
    ['Abhishek Sharma',   'All-rounder', 'Sunrisers Hyderabad',         'India',        23, 71],

    // Pacers
    ['Jasprit Bumrah',    'Pacer',       'Mumbai Indians',              'India',        30, 95],
    ['Pat Cummins',       'Pacer',       'Kolkata Knight Riders',       'Australia',    30, 92],
    ['Mitchell Starc',    'Pacer',       'Kolkata Knight Riders',       'Australia',    33, 88],
    ['Mohammed Shami',    'Pacer',       'Gujarat Titans',              'India',        33, 87],
    ['Kagiso Rabada',     'Pacer',       'Punjab Kings',                'South Africa', 28, 88],
    ['Trent Boult',       'Pacer',       'Rajasthan Royals',            'New Zealand',  34, 84],
    ['Arshdeep Singh',    'Pacer',       'Punjab Kings',                'India',        25, 78],
    ['Avesh Khan',        'Pacer',       'Rajasthan Royals',            'India',        27, 72],
    ['Shardul Thakur',    'Pacer',       'Chennai Super Kings',         'India',        32, 73],
    ['Harshal Patel',     'Pacer',       'Royal Challengers Bangalore', 'India',        33, 75],

    // Spinners
    ['Rashid Khan',       'Spinner',     'Gujarat Titans',              'Afghanistan',  25, 93],
    ['Yuzvendra Chahal',  'Spinner',     'Rajasthan Royals',            'India',        33, 83],
    ['Kuldeep Yadav',     'Spinner',     'Delhi Capitals',              'India',        29, 80],
    ['Varun Chakravarthy','Spinner',     'Kolkata Knight Riders',       'India',        32, 78],
    ['Wanindu Hasaranga', 'Spinner',     'Royal Challengers Bangalore', 'Sri Lanka',    26, 82],
    ['Maheesh Theekshana','Spinner',     'Chennai Super Kings',         'Sri Lanka',    24, 76],
    ['Piyush Chawla',     'Spinner',     'Mumbai Indians',              'India',        35, 68],
    ['Amit Mishra',       'Spinner',     'Delhi Capitals',              'India',        41, 65],
  ];

  return raw.map(([name, position, team, nationality, age, rating]) => ({
    _id: id(),
    name, position, team, nationality, age, rating,
    sport: 'cricket',
    basePrice: rating >= 85 ? 2000000 : rating >= 70 ? 1000000 : 200000,
    stats: { role: position },
    imageUrl: '',
    source: 'demo',
    isActive: true,
    soldTo: null,
    soldPrice: null,
  }));
}

// ─── FOOTBALL PLAYERS (52) ───────────────────────────
function footballPlayers() {
  const raw = [
    // GK
    ['Thibaut Courtois',     'GK',         'Real Madrid',         'Belgium',     32, 91],
    ['Alisson Becker',       'GK',         'Liverpool',           'Brazil',      31, 90],
    ['Manuel Neuer',         'GK',         'Bayern Munich',       'Germany',     38, 88],
    ['Ederson',              'GK',         'Manchester City',     'Brazil',      30, 89],
    ['Marc-André ter Stegen','GK',         'Barcelona',           'Germany',     32, 88],
    ['Mike Maignan',         'GK',         'AC Milan',            'France',      28, 86],
    ['André Onana',          'GK',         'Manchester United',   'Cameroon',    28, 84],
    ['Gianluigi Donnarumma', 'GK',         'PSG',                 'Italy',       25, 87],

    // Defenders
    ['Virgil van Dijk',      'Defender',   'Liverpool',           'Netherlands', 32, 90],
    ['Rúben Dias',           'Defender',   'Manchester City',     'Portugal',    27, 89],
    ['Antonio Rüdiger',      'Defender',   'Real Madrid',         'Germany',     31, 86],
    ['William Saliba',       'Defender',   'Arsenal',             'France',      23, 86],
    ['Trent Alexander-Arnold','Defender',  'Liverpool',           'England',     26, 88],
    ['Achraf Hakimi',        'Defender',   'PSG',                 'Morocco',     26, 87],
    ['Theo Hernández',       'Defender',   'AC Milan',            'France',      26, 85],
    ['Joshua Kimmich',       'Defender',   'Bayern Munich',       'Germany',     29, 88],
    ['Dani Carvajal',        'Defender',   'Real Madrid',         'Spain',       32, 85],
    ['João Cancelo',         'Defender',   'Barcelona',           'Portugal',    30, 84],
    ['Dayot Upamecano',      'Defender',   'Bayern Munich',       'France',      25, 83],
    ['Kyle Walker',          'Defender',   'Manchester City',     'England',     34, 82],
    ['Ben White',            'Defender',   'Arsenal',             'England',     26, 81],
    ['Jules Koundé',         'Defender',   'Barcelona',           'France',      25, 84],

    // Midfielders
    ['Kevin De Bruyne',      'Midfielder', 'Manchester City',     'Belgium',     33, 92],
    ['Luka Modrić',          'Midfielder', 'Real Madrid',         'Croatia',     39, 88],
    ['Jude Bellingham',      'Midfielder', 'Real Madrid',         'England',     21, 90],
    ['Rodri',                'Midfielder', 'Manchester City',     'Spain',       28, 91],
    ['Pedri',                'Midfielder', 'Barcelona',           'Spain',       22, 88],
    ['Gavi',                 'Midfielder', 'Barcelona',           'Spain',       20, 86],
    ['Toni Kroos',           'Midfielder', 'Real Madrid',         'Germany',     34, 88],
    ['Declan Rice',          'Midfielder', 'Arsenal',             'England',     25, 86],
    ['Martin Ødegaard',      'Midfielder', 'Arsenal',             'Norway',      25, 87],
    ['Phil Foden',           'Midfielder', 'Manchester City',     'England',     24, 89],
    ['Federico Valverde',    'Midfielder', 'Real Madrid',         'Uruguay',     26, 86],
    ['Bernardo Silva',       'Midfielder', 'Manchester City',     'Portugal',    30, 87],
    ['Ilkay Gündoğan',       'Midfielder', 'Barcelona',           'Germany',     33, 84],
    ['Leandro Trossard',     'Midfielder', 'Arsenal',             'Belgium',     29, 82],

    // Forwards
    ['Erling Haaland',       'Forward',    'Manchester City',     'Norway',      24, 94],
    ['Kylian Mbappé',        'Forward',    'Real Madrid',         'France',      26, 93],
    ['Vinicius Jr.',         'Forward',    'Real Madrid',         'Brazil',      24, 91],
    ['Mohamed Salah',        'Forward',    'Liverpool',           'Egypt',       32, 90],
    ['Robert Lewandowski',   'Forward',    'Barcelona',           'Poland',      36, 89],
    ['Harry Kane',           'Forward',    'Bayern Munich',       'England',     31, 90],
    ['Lamine Yamal',         'Forward',    'Barcelona',           'Spain',       17, 86],
    ['Bukayo Saka',          'Forward',    'Arsenal',             'England',     22, 87],
    ['Leroy Sané',           'Forward',    'Bayern Munich',       'Germany',     28, 84],
    ['Marcus Rashford',      'Forward',    'Manchester United',   'England',     26, 82],
    ['Ousmane Dembélé',      'Forward',    'PSG',                 'France',      27, 84],
    ['Ferran Torres',        'Forward',    'Barcelona',           'Spain',       24, 79],
    ['Olivier Giroud',       'Forward',    'AC Milan',            'France',      37, 77],
    ['Serhou Guirassy',      'Forward',    'Borussia Dortmund',   'Guinea',      28, 81],
    ['Donyell Malen',        'Forward',    'Borussia Dortmund',   'Netherlands', 25, 79],
    ['Raphinha',             'Forward',    'Barcelona',           'Brazil',      27, 84],
  ];

  return raw.map(([name, position, team, nationality, age, rating]) => ({
    _id: id(),
    name, position, team, nationality, age, rating,
    sport: 'football',
    basePrice: rating >= 87 ? 10000000 : rating >= 78 ? 5000000 : 1000000,
    stats: { position },
    imageUrl: '',
    source: 'demo',
    isActive: true,
    soldTo: null,
    soldPrice: null,
  }));
}

// ─── INITIALISE GLOBAL DB ────────────────────────────
async function initDB() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const guestHash = await bcrypt.hash('guest123', 10);

  global.db = {
    users: [
      {
        _id: id(),
        username: 'admin',
        email:    'admin@auction.com',
        password: adminHash,
        role:     'admin',
        stats:    { gamesPlayed: 0, wins: 0, totalSpent: 0 },
        createdAt: new Date(),
      },
      {
        _id: id(),
        username: 'guest',
        email:    'guest@auction.com',
        password: guestHash,
        role:     'user',
        stats:    { gamesPlayed: 0, wins: 0, totalSpent: 0 },
        createdAt: new Date(),
      },
    ],
    players: [...cricketPlayers(), ...footballPlayers()],
    rooms:   [],
    teams:   [],
    bids:    [],
  };

  console.log(`⚡ In-memory DB ready — ${global.db.players.length} players (${cricketPlayers().length} cricket · ${footballPlayers().length} football)`);
}

// ─── CRUD HELPERS ────────────────────────────────────
const db = {
  // generic find / get
  findOne: (col, pred)  => global.db[col].find(pred),
  findAll: (col, pred)  => pred ? global.db[col].filter(pred) : global.db[col],
  findById: (col, _id)  => global.db[col].find(o => o._id === _id),

  // insert
  insert: (col, obj) => {
    if (!obj._id) obj._id = id();
    if (!obj.createdAt) obj.createdAt = new Date();
    global.db[col].push(obj);
    return obj;
  },

  // update by id (merge patch)
  update: (col, _id, patch) => {
    const idx = global.db[col].findIndex(o => o._id === _id);
    if (idx === -1) return null;
    global.db[col][idx] = deepMerge(global.db[col][idx], patch);
    return global.db[col][idx];
  },

  // replace whole record
  replace: (col, _id, obj) => {
    const idx = global.db[col].findIndex(o => o._id === _id);
    if (idx === -1) return null;
    global.db[col][idx] = obj;
    return obj;
  },

  // delete by id
  remove: (col, _id) => {
    const idx = global.db[col].findIndex(o => o._id === _id);
    if (idx === -1) return false;
    global.db[col].splice(idx, 1);
    return true;
  },

  count: (col, pred) => (pred ? global.db[col].filter(pred) : global.db[col]).length,
};

function deepMerge(target, patch) {
  const out = { ...target };
  for (const k of Object.keys(patch)) {
    if (patch[k] !== null && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

module.exports = { initDB, db, id };
