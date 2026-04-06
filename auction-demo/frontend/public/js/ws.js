// ===== WEBSOCKET CLIENT =====
let ws = null;
let wsReconnectTimer = null;
let currentRoomCode = null;
let wsMessageHandlers = {};

function wsConnect(roomCode) {
  currentRoomCode = roomCode;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Connected');
    clearTimeout(wsReconnectTimer);
    // Join room after connection
    wsSend({ type: 'join_room', token: getToken(), roomCode });
    // Ping every 25s to keep alive
    wsReconnectTimer = setInterval(() => wsSend({ type: 'ping' }), 25000);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleWsMessage(msg);
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected. Reconnecting in 3s...');
    clearInterval(wsReconnectTimer);
    if (currentRoomCode) {
      wsReconnectTimer = setTimeout(() => wsConnect(currentRoomCode), 3000);
    }
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.warn('[WS] Not connected, cannot send:', msg.type);
  }
}

function wsDisconnect() {
  currentRoomCode = null;
  clearTimeout(wsReconnectTimer);
  clearInterval(wsReconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
}

function handleWsMessage(msg) {
  console.log('[WS] ←', msg.type, msg);

  switch (msg.type) {
    case 'connected':
      break;

    case 'pong':
      break;

    case 'room_state':
      onRoomState(msg);
      break;

    case 'user_joined':
      showToast(`${msg.username} joined the room`, 'info');
      break;

    case 'user_left':
      showToast(`${msg.username} left`, 'info');
      break;

    case 'team_joined':
      onTeamJoined(msg.team);
      break;

    case 'auction_started':
      onAuctionStarted();
      break;

    case 'auction_paused':
      updateStatusBanner('paused', '⏸ AUCTION PAUSED');
      showToast('Auction paused by admin', 'info');
      break;

    case 'auction_resumed':
      updateStatusBanner('active', '▶ AUCTION ACTIVE');
      showToast('Auction resumed', 'info');
      break;

    case 'next_player':
      onNextPlayer(msg);
      break;

    case 'bid_placed':
      onBidPlaced(msg.bid);
      break;

    case 'bid_error':
      showToast(msg.message, 'error');
      document.getElementById('bid-error').textContent = msg.message;
      document.getElementById('bid-error').classList.remove('hidden');
      setTimeout(() => document.getElementById('bid-error').classList.add('hidden'), 3000);
      break;

    case 'player_sold':
      onPlayerSold(msg);
      break;

    case 'auction_complete':
      onAuctionComplete();
      break;

    case 'teams_update':
      if (msg.teams) {
        msg.teams.forEach(t => { appState.teamsMap[t.id] = t; });
        renderAuctionTeams(msg.teams);
      }
      break;

    case 'player_unsold':
      if (msg.player) {
        clearClientTimer();
        hideSoldUnsold();
        document.getElementById('unsold-notification').classList.remove('hidden');
        document.getElementById('unsold-player').textContent = msg.player.name || '';
        setTimeout(() => document.getElementById('unsold-notification').classList.add('hidden'), 2500);
      }
      break;

    case 'error':
      showToast(msg.message, 'error');
      break;

    default:
      console.log('[WS] Unhandled:', msg.type);
  }
}

window.wsConnect = wsConnect;
window.wsDisconnect = wsDisconnect;
window.wsSend = wsSend;
