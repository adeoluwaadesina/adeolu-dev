import { db } from './_lib/db.js';
import { verifySession, httpError } from './_lib/vatar.js';

// GET  /api/owned?game=<slug>&session=<token>            -> { owned, save }
// POST /api/owned?game=<slug>  body: { session, save }    -> upsert the save blob
// (purchases() only returns UNDELIVERED items, and the third-party frame
// can't rely on cookies/localStorage, so ownership and saves live here.)
export default async function handler(req, res) {
  const game = req.query.game;

  try {
    if (req.method === 'GET') {
      const { playerId } = await verifySession(game, req.query.session);

      const sql = db();
      const [grants, saveRows] = await Promise.all([
        sql`select product_id, purchase_id, granted_at from grants where game = ${game} and player_id = ${playerId}`,
        sql`select data from saves where game = ${game} and player_id = ${playerId}`,
      ]);

      return res.status(200).json({
        playerId,
        owned: grants.map((g) => g.product_id),
        save: saveRows[0]?.data ?? null,
      });
    }

    if (req.method === 'POST') {
      const { session, save } = req.body || {};
      const { playerId } = await verifySession(game, session);

      const sql = db();
      await sql`
        insert into saves (game, player_id, data, updated_at)
        values (${game}, ${playerId}, ${JSON.stringify(save ?? {})}, now())
        on conflict (game, player_id) do update set data = excluded.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.code || 'internal_error' });
  }
}
