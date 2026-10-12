import { db } from './_lib/db.js';
import { verifySession, getPurchase, deliverPurchase, httpError } from './_lib/vatar.js';

// POST /api/claim?game=<slug>   body: { session, purchaseId }
// Verifies the purchase belongs to the caller, grants it once, then
// marks it delivered with Vatar. Safe to call more than once per purchaseId.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const game = req.query.game;
  const { session, purchaseId } = req.body || {};

  try {
    if (!purchaseId) {
      console.error('[claim] missing_purchase_id, raw body:', JSON.stringify(req.body));
      throw httpError(400, 'missing_purchase_id');
    }

    const { playerId, mode } = await verifySession(game, session);
    const purchase = await getPurchase(game, purchaseId);

    if (purchase.playerId !== playerId) throw httpError(403, 'purchase_player_mismatch');
    if (purchase.status === 'refunded') throw httpError(409, 'purchase_refunded');

    const sql = db();
    await sql`
      insert into grants (game, player_id, product_id, purchase_id, amount, mode)
      values (${game}, ${playerId}, ${purchase.productId}, ${purchaseId}, ${purchase.amount}, ${mode})
      on conflict (purchase_id) do nothing
    `;

    if (purchase.status !== 'delivered') {
      await deliverPurchase(game, purchaseId);
    }

    return res.status(200).json({ ok: true, productId: purchase.productId });
  } catch (err) {
    const status = err.status || 500;
    console.error('[claim] failed:', err.code || err.message, 'body:', JSON.stringify(req.body));
    return res.status(status).json({ error: err.code || 'internal_error' });
  }
}
