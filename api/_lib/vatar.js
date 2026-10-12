const API_BASE = 'https://lagoslife.app/api/games/v1';

// Each game has its own secret: env var VATAR_SECRET_<SLUG_UPPER_SNAKE>.
export function secretForGame(game) {
  if (!game || !/^[a-z0-9_-]{1,32}$/.test(game)) {
    throw httpError(400, 'bad_game');
  }
  const envName = `VATAR_SECRET_${game.replace(/-/g, '_').toUpperCase()}`;
  const secret = process.env[envName];
  if (!secret) throw httpError(500, `missing_secret:${envName}`);
  return secret;
}

export function httpError(status, code) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

async function callVatar(game, path, { method = 'GET', body } = {}) {
  const secret = secretForGame(game);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw httpError(res.status, `vatar_api_error:${path}`);
  }
  return res.json();
}

export function verifySession(game, session) {
  if (!session) throw httpError(400, 'missing_session');
  return callVatar(game, '/session/verify', { method: 'POST', body: { session } });
}

export function getPurchase(game, purchaseId) {
  return callVatar(game, `/purchases/${purchaseId}`);
}

export function deliverPurchase(game, purchaseId) {
  return callVatar(game, `/purchases/${purchaseId}/deliver`, { method: 'POST' });
}
