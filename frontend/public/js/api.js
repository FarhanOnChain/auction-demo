// ===== API CLIENT =====
const API_BASE = window.location.origin + '/api';

function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }

async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const API = {
  // Auth
  login: (email, password) => apiCall('POST', '/auth/login', { email, password }),
  register: (username, email, password) => apiCall('POST', '/auth/register', { username, email, password }),

  // Players
  getPlayers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiCall('GET', `/players${qs ? '?' + qs : ''}`);
  },
  syncPlayers: (sport) => apiCall('POST', '/players/sync', { sport }),
  addManualPlayer: (data) => apiCall('POST', '/players/manual', data),

  // Rooms
  createRoom: (data) => apiCall('POST', '/rooms', data),
  getRoomByCode: (code) => apiCall('GET', `/rooms/code/${code}`),
  getRoomById: (id) => apiCall('GET', `/rooms/${id}`),
  joinRoom: (code, data) => apiCall('POST', `/rooms/${code}/join`, data),
  getAllRooms: () => apiCall('GET', '/rooms'),
  getRoomResults: (id) => apiCall('GET', `/rooms/${id}/results`),
};

window.API = API;
window.getUser = getUser;
window.getToken = getToken;
