import crypto from 'node:crypto';
import { db } from './_lib/db.js';

// POST /api/webhook?game=<slug>
// Optional nudge from Vatar. We never trust the body for the grant itself —
// always re-check the purchase with GET /purchases/{id} (see claim.js) —
// this just dedupes the event and can kick off a re-check.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const game = req.query.game;
  const envName = `VATAR_WHSEC_${String(game).replace(/-/g, '_').toUpperCase()}`;
  const whsec = process.env[envName];
  if (!whsec) return res.status(500).json({ error: `missing_secret:${envName}` });

  const rawBody = await readRawBody(req);
  const signatureHeader = req.headers['x-vatar-signature'] || '';
  const expected = `sha256=${crypto.createHmac('sha256', whsec).update(rawBody).digest('hex')}`;

  if (!timingSafeEqual(signatureHeader, expected)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  if (!event.id) return res.status(400).json({ error: 'missing_event_id' });

  const sql = db();
  const [{ inserted }] = await sql`
    insert into webhook_events (event_id, game)
    values (${event.id}, ${game})
    on conflict (event_id) do nothing
    returning true as inserted
  `.catch(() => [{ inserted: false }]);

  // Deduped: already processed this event, nothing more to do.
  if (!inserted) return res.status(200).json({ ok: true, deduped: true });

  // The real grant/deliver happens via /api/claim when the client re-checks.
  return res.status(200).json({ ok: true });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
