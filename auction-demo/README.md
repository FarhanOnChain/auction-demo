# ⚡ AuctionArena — Demo (No MongoDB)

A fully web-playable multiplayer sports auction game.  
**No database required** — all data lives in-memory.  
Deploy on Render in under 2 minutes.

---

## 🚀 Run Locally

```bash
cd backend
npm install
node server.js
```

Open **http://localhost:10000**

```
👤 admin@auction.com  /  admin123   (admin — can start auctions, sync, add players)
👤 guest@auction.com  /  guest123   (regular player)
```

Register more accounts directly from the login screen.

---

## ☁️ Deploy to Render (Free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo, set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add env var: `JWT_SECRET` → any random string
5. Deploy — live in ~60 seconds

Or use the included `render.yaml` for one-click deploy.

---

## 🎮 How to Play

### Create a Room
1. Log in as admin
2. Click **CREATE ROOM**
3. Choose IPL Cricket or UCL Football
4. Share the **6-character room code** with friends

### Join a Room
1. Click **JOIN ROOM**
2. Enter the room code
3. Name your team, pick a colour

### Auction
1. Admin clicks **START AUCTION**
2. Players appear one by one
3. **Place bids** before the timer runs out
4. Highest bidder wins the player
5. Watch your budget and squad fill up!

### Admin Controls (during auction)
- ⏸ **Pause** — freeze the timer
- ▶ **Resume** — continue
- ⏭ **Skip** — move to next player without selling

---

## 📐 Game Rules

| Sport | Budget | Squad Size | Required Positions |
|-------|--------|------------|-------------------|
| 🏏 IPL Cricket | ₹120M | 18 players | Batsman, WK, All-rounder, Pacer, Spinner |
| ⚽ UCL Football | ₹200M | 23 players | GK, Defender, Midfielder, Forward |

### Base Prices — Cricket
| Rating | Base Price |
|--------|-----------|
| ≥ 85   | ₹2M       |
| 70–84  | ₹1M       |
| < 70   | ₹200K     |

### Base Prices — Football
| Rating | Base Price |
|--------|-----------|
| ≥ 87   | ₹10M      |
| 78–86  | ₹5M       |
| < 78   | ₹1M       |

---

## 🏗️ Architecture

```
auction-demo/
├── backend/
│   ├── server.js              # Express + HTTP + WebSocket (port 10000)
│   ├── db.js                  # Global in-memory DB + 98 pre-loaded players
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login|register
│   │   ├── players.js         # GET/POST/PUT/DELETE /api/players
│   │   ├── rooms.js           # GET/POST /api/rooms + join + results
│   │   └── middleware.js      # JWT auth + admin guard
│   ├── services/
│   │   └── auctionService.js  # Bidding engine, timers, sale logic
│   └── websocket/
│       └── handler.js         # Real-time WS: join, bid, admin, broadcasts
└── frontend/
    └── public/
        ├── index.html         # Single-page app (5 screens)
        ├── css/main.css       # Stadium dark theme
        └── js/
            ├── api.js         # REST client
            ├── ws.js          # WebSocket client + message router
            └── app.js         # Full UI logic
```

---

## 🔌 WebSocket Protocol

**Client → Server**
```json
{ "type": "join_room",    "token": "<jwt>", "roomCode": "ABC123" }
{ "type": "place_bid",    "token": "<jwt>", "amount": 2500000 }
{ "type": "admin_start",  "token": "<jwt>" }
{ "type": "admin_pause",  "token": "<jwt>" }
{ "type": "admin_resume", "token": "<jwt>" }
{ "type": "admin_skip",   "token": "<jwt>" }
```

**Server → Client**
```json
{ "type": "room_state",      "room": {}, "teams": [], "myTeamId": "..." }
{ "type": "auction_started" }
{ "type": "next_player",     "player": {}, "timerEnd": "...", "bidTimer": 30 }
{ "type": "bid_placed",      "bid": { "amount": 2500000, "bidderName": "..." } }
{ "type": "player_sold",     "player": {}, "team": {}, "amount": 2500000 }
{ "type": "player_unsold",   "player": {} }
{ "type": "teams_update",    "teams": [] }
{ "type": "auction_complete" }
```

---

## ⚠️ Demo Mode Notes

- **All data resets on server restart** (in-memory only)
- For persistent storage, re-add MongoDB (see original `auction-game` build)
- The "Sync Players" button in Admin Panel confirms the in-memory count (no API calls needed)
- Up to 8 teams per room by default (configurable)

---

## 📦 Dependencies

```json
"express":     "^4.18.2",
"ws":          "^8.14.2",
"cors":        "^2.8.5",
"uuid":        "^9.0.0",
"jsonwebtoken":"^9.0.2",
"bcryptjs":    "^2.4.3"
```

Zero database drivers. Zero external API calls on startup.
