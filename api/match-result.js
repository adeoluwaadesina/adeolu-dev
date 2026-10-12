import crypto from 'node:crypto';
import { db } from './_lib/db.js';

// POST /api/match-result?game=<slug>
// Called ONLY by our own realtime server (see /kit/realtime-server-template),
// authenticated with INTERNAL_RT_SECRET. We are the authority on the winner;
// this signs the result with VATAR_RESULTS_SECRET and posts it to Vatar.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const internalAuth = req.headers['x-internal-secret'];
  if (!internalAuth || internalAuth !== process.env.INTERNAL_RT_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const game = req.query.game;
  const { matchId, winnerId, payload } = req.body || {};
  if (!matchId) return res.status(400).json({ error: 'missing_match_id' });

  const resultsSecret = process.env.VATAR_RESULTS_SECRET;
  if (!resultsSecret) return res.status(500).json({ error: 'missing_secret:VATAR_RESULTS_SECRET' });

  const body = JSON.stringify({ matchId, winnerId, ...payload });
  const signature = crypto.createHmac('sha256', resultsSecret).update(body).digest('hex');

  const vatarRes = await fetch(`https://lagoslife.app/api/games/v1/matches/${matchId}/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vatar-Results-Signature': `sha256=${signature}`,
    },
    body,
  });

  if (!vatarRes.ok) {
    return res.status(vatarRes.status).json({ error: 'vatar_result_post_failed' });
  }

  const sql = db();
  await sql`
    insert into match_results (match_id, game, winner_id, payload)
    values (${matchId}, ${game}, ${winnerId}, ${JSON.stringify(payload ?? {})})
    on conflict (match_id) do update set winner_id = excluded.winner_id, payload = excluded.payload
  `;

  return res.status(200).json({ ok: true });
}
