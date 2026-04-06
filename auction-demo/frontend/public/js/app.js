// ╔════════════════════════════════════════════════════════╗
// ║         AUCTION ARENA — FRONTEND APP LOGIC            ║
// ╚════════════════════════════════════════════════════════╝

// ─── STATE ──────────────────────────────────────────────────────────────────
let appState = {
  user:          null,
  token:         null,
  currentRoom:   null,
  myTeamId:      null,
  selectedSport: 'cricket',
  selectedMode:  'auto',
  auctionTimer:  null,
  timerDuration: 30,
  teamsMap:      {},
  currentPlayer: null,
  bidHistory:    [],
  mySquad:       [],
};

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || 'null');
  if (token && user) { appState.token = token; appState.user = user; showLobby(); }
  else showScreen('screen-auth');
  setupAuthTabs();
});

// ─── SCREENS ─────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
function setupAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  try {
    const data = await API.login(email, pass);
    setAuth(data.token, data.user);
    showLobby();
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const pass     = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  try {
    const data = await API.register(username, email, pass);
    setAuth(data.token, data.user);
    showLobby();
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

function setAuth(token, user) {
  appState.token = token; appState.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function handleLogout() {
  wsDisconnect();
  appState.user = null; appState.token = null; appState.currentRoom = null; appState.myTeamId = null;
  localStorage.clear();
  showScreen('screen-auth');
}

// ─── LOBBY ───────────────────────────────────────────────────────────────────
function showLobby() {
  document.getElementById('lobby-username').textContent = appState.user?.username || '';
  const isAdmin = appState.user?.role === 'admin';
  document.getElementById('admin-badge').classList.toggle('hidden', !isAdmin);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  showScreen('screen-lobby');
}

function showCreateRoom() { document.getElementById('modal-create').classList.remove('hidden'); }
function showJoinRoom()   { document.getElementById('modal-join').classList.remove('hidden'); }
function showAdminPanel() { document.getElementById('modal-admin').classList.remove('hidden'); }
function closeModal(id)   { document.getElementById(id).classList.add('hidden'); }

function selectSport(btn, sport) {
  document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  appState.selectedSport = sport;
}
function selectMode(btn, mode) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  appState.selectedMode = mode;
}

async function handleCreateRoom() {
  const name  = document.getElementById('create-name').value.trim();
  const errEl = document.getElementById('create-error');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = 'Room name required'; errEl.classList.remove('hidden'); return; }
  try {
    const data = await API.createRoom({
      name, sport: appState.selectedSport, mode: appState.selectedMode,
      settings: {
        maxTeams: parseInt(document.getElementById('create-maxteams').value) || 8,
        bidTimer: parseInt(document.getElementById('create-timer').value) || 30,
      },
    });
    appState.currentRoom = data.room;
    appState.myTeamId    = data.team?._id || data.team?.id;
    closeModal('modal-create');
    enterWaitingRoom(data.room, data.team);
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function handleJoinRoom() {
  const code     = document.getElementById('join-code').value.trim().toUpperCase();
  const teamName = document.getElementById('join-teamname').value.trim();
  const color    = document.getElementById('join-color').value;
  const errEl    = document.getElementById('join-error');
  errEl.classList.add('hidden');
  if (!code) { errEl.textContent = 'Room code required'; errEl.classList.remove('hidden'); return; }
  try {
    const joined   = await API.joinRoom(code, { teamName, color });
    const roomData = await API.getRoomByCode(code);
    appState.currentRoom = roomData.room;
    appState.myTeamId    = joined.team?._id || joined.team?.id;
    closeModal('modal-join');
    enterWaitingRoom(roomData.room, joined.team);
  } catch(err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

// ─── WAITING ROOM ────────────────────────────────────────────────────────────
function enterWaitingRoom(room, myTeam) {
  appState.currentRoom = room;
  const code = room.code || '';
  document.getElementById('waiting-room-name').textContent     = room.name || '';
  document.getElementById('waiting-code').textContent          = code;
  document.getElementById('waiting-code2').textContent         = code;
  document.getElementById('waiting-sport-icon').textContent    = room.sport === 'cricket' ? '🏏' : '⚽';
  document.getElementById('waiting-room-info').textContent     = `${(room.sport||'').toUpperCase()} · ${(room.mode||'').toUpperCase()} MODE`;

  const adminId = room.admin?._id || room.admin;
  const isAdmin = adminId === appState.user?.id || appState.user?.role === 'admin';
  document.getElementById('waiting-controls').classList.toggle('hidden', !isAdmin);

  if (Array.isArray(room.teams)) {
    appState.teamsMap = {};
    room.teams.forEach(t => { const n = normTeam(t); appState.teamsMap[n.id] = n; });
    renderWaitingTeams(Object.values(appState.teamsMap));
  }

  showScreen('screen-waiting');
  wsConnect(code);
}

function copyRoomCode() {
  const code = document.getElementById('waiting-code2').textContent;
  navigator.clipboard?.writeText(code).then(() => showToast('Copied!', 'success'));
}

function renderWaitingTeams(teams) {
  document.getElementById('team-count').textContent = teams.length;
  document.getElementById('teams-grid').innerHTML = teams.map(t => `
    <div class="team-card-waiting">
      <div class="team-color-dot" style="background:${t.color||'#4a90e2'}"></div>
      <div class="team-name">${esc(t.name||'')}</div>
      <div class="team-owner">${esc(t.owner?.username || t.owner || '')}</div>
    </div>`).join('');
}

function adminStartAuction() {
  wsSend({ type: 'admin_start', token: getToken() });
}

// ─── AUCTION SCREEN ──────────────────────────────────────────────────────────
function enterAuctionRoom() {
  const room    = appState.currentRoom || {};
  const sport   = room.sport || 'cricket';
  const adminId = room.admin?._id || room.admin;
  const isAdmin = adminId === appState.user?.id || appState.user?.role === 'admin';

  document.getElementById('auction-room-name').textContent   = room.name || '';
  const badge = document.getElementById('auction-sport-badge');
  badge.textContent = sport === 'cricket' ? '🏏 IPL' : '⚽ UCL';
  badge.className   = `sport-badge ${sport}`;
  document.getElementById('auction-username').textContent    = appState.user?.username || '';
  document.getElementById('admin-controls').classList.toggle('hidden', !isAdmin);

  appState.bidHistory = []; appState.mySquad = [];
  renderBidHistory(); renderMySquad();

  showScreen('screen-auction');
  updateStatusBanner('active', '▶ AUCTION IS LIVE — WAITING FOR FIRST PLAYER…');
}

// ─── WS MESSAGE HANDLERS ─────────────────────────────────────────────────────
function onRoomState(msg) {
  const { room, teams, myTeamId, isAdmin } = msg;
  if (room) appState.currentRoom = { ...appState.currentRoom, ...room };
  if (myTeamId) appState.myTeamId = myTeamId;

  if (Array.isArray(teams)) {
    appState.teamsMap = {};
    teams.forEach(t => { appState.teamsMap[t.id] = t; });
  }

  if (document.getElementById('screen-waiting').classList.contains('active')) {
    renderWaitingTeams(Object.values(appState.teamsMap));
    if (isAdmin) document.getElementById('waiting-controls').classList.remove('hidden');
  }
  if (document.getElementById('screen-auction').classList.contains('active')) {
    renderAuctionTeams(Object.values(appState.teamsMap));
    if (appState.myTeamId && appState.teamsMap[appState.myTeamId])
      updateMyBudget(appState.teamsMap[appState.myTeamId].budgetRemaining);
  }

  // rejoin mid-auction
  if (room?.status === 'active' || room?.status === 'paused') {
    if (!document.getElementById('screen-auction').classList.contains('active')) {
      enterAuctionRoom();
      renderAuctionTeams(Object.values(appState.teamsMap));
    }
    if (room.status === 'paused') updateStatusBanner('paused', '⏸ AUCTION PAUSED');
    if (room.currentPlayer) {
      showPlayerOnBlock(room.currentPlayer);
      if (room.currentBid?.timerEnd) {
        const sec = Math.max(0, Math.floor((new Date(room.currentBid.timerEnd) - Date.now()) / 1000));
        startClientTimer(sec, room.settings?.bidTimer || 30);
      }
      if (room.currentBid?.amount > 0) {
        document.getElementById('current-bid-display').textContent = formatPrice(room.currentBid.amount);
        document.getElementById('current-bidder-display').textContent = '(from before you joined)';
      }
    }
  }
  if (room?.status === 'completed') {
    updateStatusBanner('completed', '🏆 AUCTION COMPLETE!');
  }
}

function onTeamJoined(team) {
  if (!team) return;
  const t = normTeam(team);
  appState.teamsMap[t.id] = t;
  renderWaitingTeams(Object.values(appState.teamsMap));
  showToast(`${t.owner?.username || t.owner || 'Someone'} joined with "${t.name}"`, 'info');
}

function onAuctionStarted() {
  enterAuctionRoom();
  renderAuctionTeams(Object.values(appState.teamsMap));
  showToast('🚀 Auction started!', 'success');
}

function onNextPlayer(msg) {
  const { player, timerEnd, bidTimer } = msg;
  appState.currentPlayer = player;
  appState.timerDuration = bidTimer || 30;

  hideSoldUnsold();
  showPlayerOnBlock(player);
  updateStatusBanner('active', '▶ PLACE YOUR BIDS!');

  document.getElementById('bid-amount').value                   = '';
  document.getElementById('current-bid-display').textContent    = '—';
  document.getElementById('current-bidder-display').textContent = '';
  document.getElementById('bid-error').classList.add('hidden');

  generateQuickBids(player.basePrice);

  const secs = timerEnd
    ? Math.max(1, Math.floor((new Date(timerEnd) - Date.now()) / 1000))
    : (bidTimer || 30);
  startClientTimer(secs, bidTimer || 30);

  showToast(`🔔 Now: ${player.name}`, 'info');
}

function onBidPlaced(bid) {
  const { amount, bidderName, teamId, timerEnd } = bid;
  document.getElementById('current-bid-display').textContent    = formatPrice(amount);
  document.getElementById('current-bidder-display').textContent = `by ${bidderName}`;

  document.querySelectorAll('.auction-team-card').forEach(el => el.classList.remove('current-bidder'));
  const card = document.getElementById(`team-card-${teamId}`);
  if (card) card.classList.add('current-bidder');

  addBidHistory({ amount, bidder: bidderName });

  if (timerEnd) {
    const sec = Math.max(1, Math.floor((new Date(timerEnd) - Date.now()) / 1000));
    startClientTimer(sec, appState.timerDuration);
  }
}

function onPlayerSold(msg) {
  const { player, team, amount } = msg;
  clearClientTimer();
  document.getElementById('player-on-block').classList.add('hidden');

  const soldEl = document.getElementById('sold-notification');
  soldEl.classList.remove('hidden');
  document.getElementById('sold-details').innerHTML =
    `<strong>${esc(player?.name)}</strong> → <strong style="color:var(--accent)">${esc(team?.owner||'?')}</strong> for <strong style="color:var(--accent)">${formatPrice(amount)}</strong>`;

  if (team?.id === appState.myTeamId) {
    appState.mySquad.push({ player, pricePaid: amount });
    renderMySquad();
  }

  const t = appState.teamsMap[team?.id];
  if (t) { t.budgetRemaining = (t.budgetRemaining||0) - amount; t.playerCount = (t.playerCount||0)+1; }
  renderAuctionTeams(Object.values(appState.teamsMap));
  if (appState.myTeamId && appState.teamsMap[appState.myTeamId])
    updateMyBudget(appState.teamsMap[appState.myTeamId].budgetRemaining);

  showToast(`🔨 ${player?.name} SOLD — ${formatPrice(amount)}`, 'success');
  setTimeout(() => soldEl.classList.add('hidden'), 3000);
}

function onAuctionComplete() {
  clearClientTimer();
  updateStatusBanner('completed', '🏆 AUCTION COMPLETE!');
  showToast('🏆 Complete! Loading results…', 'success');
  setTimeout(loadResults, 2200);
}

// ─── PLAYER DISPLAY ──────────────────────────────────────────────────────────
function showPlayerOnBlock(player) {
  if (!player) return;
  document.getElementById('player-on-block').classList.remove('hidden');
  document.getElementById('player-name-display').textContent       = player.name || '?';
  document.getElementById('player-team-display').textContent       = player.team || '';
  document.getElementById('player-nationality-display').textContent= player.nationality || '';
  document.getElementById('player-position-tag').textContent       = (player.position||'').toUpperCase();
  document.getElementById('base-price-display').textContent        = formatPrice(player.basePrice);
  document.getElementById('player-rating-display').textContent     = player.rating ?? '—';

  const initials = (player.name||'??').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  const photoEl  = document.getElementById('player-photo');
  if (player.imageUrl) {
    photoEl.innerHTML = `<img src="${player.imageUrl}" alt="${esc(player.name)}" onerror="this.parentElement.innerHTML='<div class=\\'player-initials\\'>${initials}</div>'"/>`;
  } else {
    photoEl.innerHTML = `<div class="player-initials">${initials}</div>`;
  }

  const s = player.stats || {};
  const items = [];
  if (s.goals     != null) items.push({ key:'GOALS',  val: s.goals });
  if (s.assists   != null) items.push({ key:'ASSISTS', val: s.assists });
  if (s.battingStyle)      items.push({ key:'BAT',     val: s.battingStyle.replace('-hand bat','') });
  if (s.bowlingStyle)      items.push({ key:'BOWL',    val: s.bowlingStyle.split(' ').pop() });
  if (s.appearances)       items.push({ key:'APPS',    val: s.appearances });
  document.getElementById('player-stats-row').innerHTML = items.slice(0,4).map(i =>
    `<div class="player-stat"><div class="stat-val">${i.val}</div><div class="stat-key">${i.key}</div></div>`
  ).join('');
}

function hideSoldUnsold() {
  document.getElementById('sold-notification').classList.add('hidden');
  document.getElementById('unsold-notification').classList.add('hidden');
}

// ─── TIMER ───────────────────────────────────────────────────────────────────
function startClientTimer(seconds, total) {
  clearClientTimer();
  let remaining = seconds;
  updateTimerUI(remaining, total);
  appState.auctionTimer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    updateTimerUI(remaining, total);
    if (remaining <= 0) clearClientTimer();
  }, 1000);
}
function clearClientTimer() {
  if (appState.auctionTimer) { clearInterval(appState.auctionTimer); appState.auctionTimer = null; }
}
function updateTimerUI(remaining, total) {
  const display = document.getElementById('timer-display');
  const circle  = document.getElementById('timer-circle');
  if (!display || !circle) return;
  display.textContent = remaining;
  circle.style.strokeDashoffset = 276 * (1 - remaining / (total||30));
  const urgent = remaining <= 10;
  circle.classList.toggle('urgent', urgent);
  display.style.color = urgent ? 'var(--accent2)' : 'var(--text-primary)';
}

// ─── BIDDING ─────────────────────────────────────────────────────────────────
function generateQuickBids(basePrice) {
  const bids = [basePrice, Math.round(basePrice*1.25), Math.round(basePrice*1.5), Math.round(basePrice*2)];
  document.getElementById('quick-bids').innerHTML = bids.map(b =>
    `<button class="quick-bid-btn" onclick="setQuickBid(${b})">${formatPrice(b)}</button>`
  ).join('');
}
function setQuickBid(amount) {
  document.getElementById('bid-amount').value = (amount / 1_000_000).toFixed(2);
}
function placeBid() {
  const raw = parseFloat(document.getElementById('bid-amount').value);
  if (!raw || raw <= 0) { showToast('Enter a valid bid amount', 'error'); return; }
  wsSend({ type: 'place_bid', token: getToken(), amount: Math.round(raw * 1_000_000) });
}

// ─── TEAMS SIDEBAR ───────────────────────────────────────────────────────────
function renderAuctionTeams(teams) {
  document.getElementById('auction-teams-list').innerHTML = teams.map(t => {
    const mine = t.id === appState.myTeamId;
    return `<div class="auction-team-card ${mine?'my-team':''}" id="team-card-${t.id}">
      <div class="team-card-header">
        <div class="team-dot" style="background:${t.color||'#4a90e2'}"></div>
        <div class="team-card-name">${esc(t.name)}</div>
        ${mine?'<span class="team-my-label">YOU</span>':''}
      </div>
      <div class="team-card-budget">Budget: <span>${formatPrice(t.budgetRemaining)}</span></div>
      <div class="team-card-count">${t.playerCount||(t.players?.length??0)} players</div>
    </div>`;
  }).join('');
  if (appState.myTeamId && appState.teamsMap[appState.myTeamId])
    updateMyBudget(appState.teamsMap[appState.myTeamId].budgetRemaining);
}
function updateMyBudget(budget) {
  const el = document.getElementById('my-budget-display');
  if (el) el.textContent = formatPrice(budget);
}

// ─── BID HISTORY ─────────────────────────────────────────────────────────────
function addBidHistory(bid) {
  appState.bidHistory.unshift(bid);
  if (appState.bidHistory.length > 30) appState.bidHistory.pop();
  renderBidHistory();
}
function renderBidHistory() {
  document.getElementById('bid-history-list').innerHTML = appState.bidHistory.map((b, i) =>
    `<div class="bid-entry ${i===0?'winning':''}">
      <span class="bid-entry-amount">${formatPrice(b.amount)}</span>
      <span class="bid-entry-bidder"> — ${esc(b.bidder)}</span>
    </div>`
  ).join('');
}

// ─── MY SQUAD ────────────────────────────────────────────────────────────────
function renderMySquad() {
  document.getElementById('my-squad-list').innerHTML = appState.mySquad.map(item =>
    `<div class="squad-player">
      <div>
        <div class="squad-player-name">${esc(item.player?.name)}</div>
        <div class="squad-player-pos">${item.player?.position||''}</div>
      </div>
      <div class="squad-player-price">${formatPrice(item.pricePaid)}</div>
    </div>`
  ).join('');
}

// ─── STATUS BANNER ───────────────────────────────────────────────────────────
function updateStatusBanner(state, text) {
  const el = document.getElementById('auction-status-banner');
  el.className   = `status-banner ${state}`;
  el.textContent = text;
}

// ─── RESULTS ─────────────────────────────────────────────────────────────────
async function loadResults() {
  try {
    const roomId = appState.currentRoom?.id || appState.currentRoom?._id;
    const data   = await API.getRoomResults(roomId);
    renderResults(data.teams);
    showScreen('screen-results');
  } catch(err) { showToast('Results error: ' + err.message, 'error'); }
}

function renderResults(teams) {
  document.getElementById('results-content').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:2rem;margin-bottom:.5rem">🏆 AUCTION RESULTS</h2>
    <p style="color:var(--text-secondary);margin-bottom:2rem">${esc(appState.currentRoom?.name||'')}</p>
    <div class="results-grid">
      ${(teams||[]).map(team => {
        const owner   = team.owner?.username || team.owner || '';
        const players = team.players || [];
        return `<div class="result-team-card">
          <div class="result-team-header" style="border-left:4px solid ${team.color||'#4a90e2'}">
            <div>
              <div class="result-team-name">${esc(team.name)}</div>
              <div class="result-team-owner">@${esc(owner)}</div>
            </div>
            <div class="result-team-budget">₹${formatPricePlain(team.budgetRemaining)} left</div>
          </div>
          <div class="result-player-list">
            ${players.length===0
              ? '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem">No players acquired</p>'
              : players.map(e => {
                  const p = e.player || {};
                  return `<div class="result-player">
                    <div><span class="squad-player-name">${esc(p.name||'?')}</span>
                    <span class="result-player-pos"> · ${p.position||''}</span></div>
                    <div class="result-player-price">${formatPrice(e.pricePaid)}</div>
                  </div>`;
                }).join('')
            }
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`admin-tab-${tab}`).classList.add('active');
  if (tab === 'rooms') loadAdminRooms();
}

async function syncPlayers(sport) {
  const el = document.getElementById('sync-result');
  el.textContent = `Syncing ${sport}…`;
  el.classList.remove('hidden');
  try {
    const data = await API.syncPlayers(sport);
    el.textContent = `✅ ${data.message}`;
    showToast('Done!', 'success');
  } catch(err) { el.textContent = `❌ ${err.message}`; }
}

async function addManualPlayer() {
  const data = {
    name:        document.getElementById('mp-name').value.trim(),
    sport:       document.getElementById('mp-sport').value,
    position:    document.getElementById('mp-position').value,
    team:        document.getElementById('mp-team').value.trim(),
    nationality: document.getElementById('mp-nation').value.trim(),
    age:         parseInt(document.getElementById('mp-age').value)     || undefined,
    rating:      parseInt(document.getElementById('mp-rating').value)  || 70,
    basePrice:   parseFloat(document.getElementById('mp-price').value) * 1_000_000 || undefined,
  };
  const el = document.getElementById('manual-result');
  el.classList.add('hidden');
  try {
    await API.addManualPlayer(data);
    el.textContent = `✅ ${data.name} added!`; el.classList.remove('hidden');
    showToast('Player added!', 'success');
  } catch(err) { el.textContent = `❌ ${err.message}`; el.classList.remove('hidden'); }
}

async function loadAdminRooms() {
  const list = document.getElementById('admin-rooms-list');
  list.innerHTML = '<p style="color:var(--text-muted)">Loading…</p>';
  try {
    const data = await API.getAllRooms();
    list.innerHTML = (data.rooms||[]).map(r => `
      <div class="admin-room-row">
        <div class="room-row-info">
          <div>${esc(r.name)} <span class="room-row-code">${r.code}</span></div>
          <div style="color:var(--text-muted);font-size:.75rem">${r.sport} · ${r.mode} · ${r.teams?.length??0} teams</div>
        </div>
        <span class="room-row-status status-${r.status}">${(r.status||'').toUpperCase()}</span>
      </div>`).join('');
  } catch(err) { list.innerHTML = `<p style="color:var(--accent2)">${err.message}</p>`; }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function normTeam(t) { return { ...t, id: t._id || t.id }; }

function formatPrice(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `₹${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₹${(n/1_000).toFixed(0)}K`;
  return `₹${n}`;
}
function formatPricePlain(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(0)}K`;
  return `${n}`;
}
function esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(message, type = 'info') {
  const c     = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className   = `toast ${type}`;
  toast.textContent = message;
  c.appendChild(toast);
  setTimeout(() => {
    toast.style.cssText += 'opacity:0;transform:translateY(10px);transition:all .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// close modal on backdrop click
document.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); });
// enter key for auth
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!document.getElementById('screen-auth').classList.contains('active')) return;
  document.getElementById('tab-login').classList.contains('active') ? handleLogin() : handleRegister();
});

// ─── EXPORTS (called by ws.js) ────────────────────────────────────────────────
window.showScreen          = showScreen;
window.showToast           = showToast;
window.onRoomState         = onRoomState;
window.onTeamJoined        = onTeamJoined;
window.onAuctionStarted    = onAuctionStarted;
window.onNextPlayer        = onNextPlayer;
window.onBidPlaced         = onBidPlaced;
window.onPlayerSold        = onPlayerSold;
window.onAuctionComplete   = onAuctionComplete;
window.renderAuctionTeams  = renderAuctionTeams;
window.updateMyBudget      = updateMyBudget;
window.hideSoldUnsold      = hideSoldUnsold;
window.clearClientTimer    = clearClientTimer;
window.startClientTimer    = startClientTimer;
window.appState            = appState;
