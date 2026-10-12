# Vatar Games Studio — handoff doc

This is a standalone reference for bringing another AI model (or a human) up to
speed on this project, specifically to get help making the games **look and feel
better** — more detailed visuals, real physics, more satisfying game feel. It
doesn't assume you've seen any other file in this repo.

**What this doc is NOT for:** changing how purchases, sessions, or the server
integration work. That part is done, tested against the real Vatar sandbox, and
fragile in ways that aren't obvious from the UI. Treat `kit/vatar-helpers.js` and
everything under `/api/` as a contract to build *on top of*, not to rewrite. If a
design change requires touching those files, flag it rather than just doing it.

---

## 1. What this platform is

**Vatar Games** is an in-app games platform inside **Lagos Life**
(lagoslife.app), a Nigerian social/lifestyle app. Independent developers (us —
"LuluGames") build HTML5 games that run in a **sandboxed iframe** inside Lagos
Life. Lagos Life handles the player base, payments, and leaderboards; we just
build the game and a thin server layer that verifies purchases.

- Developer docs: `https://lagoslife.app/developers/docs`
- Developer agreement: `https://lagoslife.app/developers/agreement`
- Sandbox/dashboard: `https://lagoslife.app/developers/sandbox/<id>` (per-game,
  given after registering a game)

**Business model:** players buy small IAPs (₦100–₦50,000) inside each game. We
keep 70% of gross sales, paid monthly once the balance hits ₦5,000. That's the
only real-money income — this is NOT an ads platform, there's no ad SDK, no
tracking, no external payment links allowed.

## 2. How a game actually runs

1. Our game is static HTML/CSS/JS hosted on **our own domain**
   (`https://adeolu.xyz/games/<slug>/`), nothing server-rendered.
2. Lagos Life iframes that URL. The game loads the real Vatar SDK from
   `https://lagoslife.app/sdk/vatar-games-v1.js` — **always from there, never a
   local copy** — and our own thin wrapper, `kit/vatar-helpers.js`.
3. `Vatar.init()` resolves with `{ player: {id, name, avatar}, session, mode }`.
   `player.id` is a per-game pseudonym (`t_...` in sandbox/test, `p_...` live).
   Outside the real iframe this throws `not_framed` — our kit catches that and
   falls back to a mock player so the game is still playable/testable standalone
   (this is "dev mode" — you'll see a console warning when it's active).
4. When a player buys something, `Vatar.purchase(productId)` opens Lagos Life's
   own payment sheet (we never build our own payment UI). It resolves with a
   purchase id. **Our server** then has to independently verify that purchase
   with Vatar's API (never trust the client) before granting the item — see §4.
5. Scores go to a shared per-game leaderboard via `Vatar.submitScore(n)` /
   `Vatar.leaderboard()` — Vatar hosts this, we don't build our own.

## 3. SDK reference (client-side, already wrapped by our kit)

Every SDK call returns a Promise. Errors carry a `.code`.

| Call | What it does |
|---|---|
| `Vatar.init()` | → `{player, session, mode}`. Throws `not_framed` outside the real iframe. |
| `Vatar.session()` | Fresh 15-minute auth token. Get one before every call to **our** server. |
| `Vatar.purchase(productId)` | Opens the real pay sheet. One at a time, max one call per 3s. |
| `Vatar.purchases()` | Recovers purchases that are *paid but not yet delivered* (e.g. after a reload mid-purchase). Only returns undelivered ones. |
| `Vatar.onPurchase(fn)` | Fires on purchase events. |
| `Vatar.submitScore(n)` | One submission per player per 20s; sooner → `too_soon` error. |
| `Vatar.leaderboard()` | → `{top: [...], me: {label}}`, top 50. |
| `Vatar.onPause(fn)` / `Vatar.onResume(fn)` | App backgrounded/foregrounded — **must** stop timers/audio on pause, this is a hard review requirement. |
| `Vatar.match.create/join/quick/current/leave/onUpdate` | Multiplayer **lobbies only** (2–4 seats) — it does NOT sync live gameplay, see §7. |

## 4. The purchase verification flow (why `/api/` exists)

Vatar's API base: `https://lagoslife.app/api/games/v1`, auth header
`Authorization: Bearer <secret>` — `vtr_test_...` in sandbox, `vtr_live_...` once
approved. **Each game has its own secret**, issued when you register that game
on the developer portal.

Flow our server (`api/claim.js`) runs on every purchase:
1. `POST /session/verify {session}` → `{playerId, name, gameId, exp, mode}` —
   confirms the session token is real and tells us who the player is.
2. `GET /purchases/{id}` → `{productId, playerId, amount, status, mode}` —
   confirms the purchase itself is real, paid, and belongs to this player.
3. Check `purchase.playerId === session.playerId` and `status !== 'refunded'`.
4. Grant the item **once** per `purchaseId` in our own Neon Postgres DB (unique
   constraint on `purchase_id`, `on conflict do nothing` — purchases get
   re-verified on every app load via `Vatar.purchases()`, so this must be
   idempotent).
5. `POST /purchases/{id}/deliver` — idempotent, tells Vatar it's been granted.

This is why `purchases()` only returning *undelivered* items matters: ownership
and save data **cannot** live in cookies/localStorage (unreliable in a
third-party iframe) — it has to live in our DB, keyed by `(game_slug,
player_id)`. On load, every game calls our `/api/owned` endpoint to ask "what
does this player already own and what's their save."

## 5. Review checklist (what Vatar checks before approving a game)

1. **Sandbox integration checklist fully ticked:** SDK init seen, a test
   purchase made, that purchase verified by our server, one purchase marked
   delivered. (Multiplayer games additionally need a test match created,
   joined, and its result posted by our server.)
2. Response header `Content-Security-Policy: frame-ancestors
   https://lagoslife.app https://www.lagoslife.app https://naijalife.app
   https://www.naijalife.app https://lagoslife.eliysites.com`. **No**
   `X-Frame-Options`.
3. **Phone-first, 375×812 portrait, touch only** — no hover-only controls.
4. Fast load on mobile data.
5. Pauses cleanly on `onPause`. **Audio only starts after the player's first
   tap** (browser autoplay rules + review requirement).
6. **Not allowed inside the frame, at all:** `fullscreen`, `alert`/`confirm`/
   `prompt`, popups, `window.open`, downloads, camera, mic, location, clipboard.
7. Products: whole naira, ₦100–₦50,000, max 20 per game, honest names, no fake
   timers/dark patterns, ids match `[a-z0-9_-]{1,32}`.
8. Listing: 512px square icon (PNG/JPEG/WebP, not SVG), 3–5 real-gameplay
   screenshots, ≤120-char short description, honest long description.
9. **Never allowed, at all:** gambling/real-money prizes, external payment
   links, ad networks/tracking, collecting personal data, adult content, real
   brands/logos/songs/celebrities. Match stakes may use **only** Lagos Life's
   in-game money via `Vatar.match` — never real money.
10. The registered URL and webhook are **locked once approved** — changing
    either sends the game back to review. Register the final production URL
    from day one.

## 6. Repo structure and what's already built

**Latest local update, 2026-10-12:** Codex polished archery and developed the
existing Color Rush prototype into solo and three-bot play. Changes are in the
uncommitted `dev` working tree, not deployed. See [CLAUDE-REVIEW.md](CLAUDE-REVIEW.md)
for review instructions, evidence and outstanding validation. Earlier sandbox
passes below refer to the versions described in the original handoff.

Everything lives in one repo: **`adeoluwaadesina/adeolu-dev`** (also hosts
Adeolu's personal portfolio at the root — that part is his, hands off unless
told otherwise).

```
/index.html, /styles.css, /script.js   # Adeolu's portfolio — leave alone
/games/index.html                      # games landing page (personal catalog, playable directly)
/games/<slug>/index.html               # one self-contained HTML file per game
/games/<slug>/products.json            # our own reference copy of that game's IAPs
/games/<slug>/assets/                  # icon, screenshots, listing copy (once built)
/kit/vatar-helpers.js                  # shared client wrapper — DO NOT break its contract
/api/claim.js, owned.js, webhook.js, match-result.js   # serverless functions (Vercel)
/db/schema.sql                         # Neon Postgres: grants, saves, webhook_events, match_results
vercel.json                            # CSP header, scoped to /games/* only
```

Hosting: one Vercel project, one domain (`adeolu.xyz`, apex redirects to `www`).
DB: Neon serverless Postgres via `@neondatabase/serverless`. Branches: `dev` is
the working/default branch, `master` is production-only — promote `dev` →
`master` only when something's ready to actually go live.

**Each game's secret env var is named `VATAR_SECRET_<SLUG_UPPER_SNAKE>`** (e.g.
`VATAR_SECRET_TAP_TAP_LAGOS`, `VATAR_SECRET_ARCHERY`) — dashes in the slug
become underscores. Webhook secret: `VATAR_WHSEC_<SLUG>`. Multiplayer results
secret (`VATAR_RESULTS_SECRET`) is shared across every game, no per-game suffix.

### Games built so far

**`tap-tap-lagos`** — the official Vatar sample, built first to prove the kit
end to end. Tap a sun emoji to score, one IAP (`double_taps`, ₦100, doubles tap
value), top-3 leaderboard sheet. Passed the full sandbox checklist.

**`archery`** — solo ladder (Beginner → Expert, 5 tiers), visually modeled on
iMessage's GamePigeon Archery after Adeolu shared reference screenshots:
mountains/trees backdrop, a converging grass lane, a stand-mounted target with
numbered ring labels, arrows that visually stick in the target with fletching,
a big on-target score pop-up. Mechanically: wind drifts the shot horizontally
(shown as a decimal value + direction arrow, you compensate by dragging), a
single press-hold-drag-release gesture controls both aim (free 2D drag) and
power (auto-charges the longer you hold, like pulling a bowstring) — release
manually or it auto-fires past a timeout, matching the reference game's feel.
Three products (two cosmetic, one progression-skip). Passed the full sandbox
checklist for the earlier version. The 2026-10-12 local polish adds layered
procedural terrain and foliage, a visible bow, animated arrow flight, impact
particles, synthesized sound, a draw sweet spot and stronger pause/input
handling. Flight is an arcade visual arc with deterministic wind/power landing
offsets, not a full ballistic physics simulation. New changes await review and
real-iframe validation.

**`color-rush`** — the existing solo prototype was developed locally on
2026-10-12 using Adeolu's supplied gameplay recording as a mechanics reference.
It now has a perspective 4×4 floating arena over a stylized lagoon, detailed
cars, steering/braking, solo or three bots, collision push-offs, persistent
colour-and-symbol cues, animated tile/car falls, pause and free replay. A
continue retries the failed round rather than crediting it as survived.
Real multiplayer is not implemented; sandbox/registration status was not
verified in this session.

These games are built as a **single self-contained HTML file per game** — inline
`<style>` and `<script>`, Canvas 2D for any graphics, no build step, no
external art assets (everything is code-drawn shapes/gradients). That's a
deliberate project convention (see §8), not a limitation of the platform —
Phaser, Matter.js/Planck.js, three.js are all fine to use per the game specs
below if a game's physics calls for it.

## 7. The full game roster (from the project brief)

Priority order, solo-first then bots then real multiplayer (see §7a for why):

1. **archery** (solo; local polish awaiting review) — wind + draw-power
2. **color-rush** — 4 cars on a grid, dodge the "wrong color" tiles that drop
   away; local solo and three-bot modes implemented, awaiting review
3. **dispatch-rider** — Lagos Island food delivery, lane-runner or top-down
   scrolling, dodge obstacles (potholes, danfos, hawkers), fragile cargo spills
4. **whot** — Nigerian card game, shared deck/turn engine, easiest first
   multiplayer title (turn-based)
5. **last-card** — Crazy Eights-style, reuses whot's card engine
6. **can-i-hit** — dodgeball, pick up/throw/catch/dodge, top-down arena
7. **street-racer** — pseudo-3D (OutRun-style) arcade racing, nitro/drift
8. **score-hero** — swipe-to-shoot football, frozen-moment levels (twist TBD,
   ask Adeolu)
9. **carry-the-glass** — 2-player co-op platformer, physics glass-carrying
   (Matter.js/Planck.js), solo = control both workers at once (chaotic/funny)
10. **dont-pull-me** — rope-linked climbers, shares physics core with #9
11. **naija-farm** — SimCity-style farm tycoon, offline progress calculated
    server-side
12. **act-normal** — blend-in-with-NPCs social deduction, biggest build, last

Full mechanical specs, monetisation ranges, and "original art only" notes for
each are in `CLAUDE.md` at the repo root — read that for the specific game
you're working on, it has more detail than fits here.

### 7a. The three-stage rule (applies to every multiplayer-capable game)

`Vatar.match` only does lobbies/stakes/results for 2–4 seats — it does **not**
sync live gameplay. Real-time sync needs our own realtime server (Colyseus on
Fly.io/Railway, or similar), which doesn't exist yet. So every game ships in
this order, and **it's fine to ship at stage 1 or 2 if it's fun there**:

1. **Solo** — the core game works alone.
2. **Solo vs bots** — empty seats filled with AI, up to 4 total.
3. **vs real players** — via `Vatar.match` + the realtime server. Bots still
   fill empty seats.

Max 4 players in every game, always.

## 8. Current conventions — what "good" means on this project

- **Original art/audio only.** No copying a reference game's actual art,
  character designs, or names — mechanics-only inspiration. Prefer
  code-drawn/procedural art or CC0 packs (Kenney.nl) over nothing, but don't
  feel boxed into flat canvas shapes if a game calls for sprites/real
  assets — that's exactly the kind of upgrade we're looking for help with.
- **No heavy build step unless a game actually needs one.** Plain HTML/CSS/JS
  per game is the default; reach for Phaser/Matter.js/Planck.js/three.js when
  the game's physics genuinely calls for it (several games in the roster
  explicitly do — see §7).
- **Mobile-first, 375×812, touch-only**, always. Every game needs a working
  "dev mode" (mock player) so it's testable outside the real iframe.
- **Lagos flavour is the edge** — local settings, humour, Pidgin touches where
  natural. Not forced, but noticeable.
- **What "better" means here:** more detailed/beautiful visuals, real physics
  where a game calls for it, more satisfying game feel (juice: screen shake,
  particle bursts, easing, sound). What it does NOT mean: breaking the kit
  contract, adding a build step that makes games hard to keep lightweight, or
  copying a reference game's actual assets.

## 9. Known gotchas (learned the hard way this session — don't re-learn these)

- **Vercel's GitHub webhook integration has been unreliable** for this
  project — pushes repeatedly failed to trigger any deployment at all, even
  after reconnecting. Fixed by linking the Vercel CLI directly (`vercel login`,
  `vercel link`) and deploying with `vercel deploy` / `vercel deploy --prod`.
  Prefer that over waiting on auto-deploy if you have CLI access.
- **Don't rely solely on `requestAnimationFrame` for a must-fire timeout.** rAF
  can silently stop ticking when a tab is backgrounded/throttled. Archery's
  auto-release-on-timeout (holding past a time limit should fire the shot
  automatically) looked fine in normal testing but silently never fired when
  driven programmatically with delays — confirmed and fixed by backing it with
  a real `setTimeout` instead.
- **A canvas-drawn target had its ring-score colors literally inverted**
  (gold/highest-score drawn as the outer ring instead of the center) in an
  earlier pass — worth double-checking any score-zone visual against the
  actual scoring math, not just eyeballing it.
- Env var naming mismatches (missing the per-game suffix) silently 500'd the
  claim endpoint with no useful client-side error — if a purchase "does
  nothing," check Vercel's env vars and function logs before assuming the
  client code is wrong.

## 10. Latest local verification — 2026-10-12

`games/tests/gameplay.cjs` passed 31 browser checks with no page runtime errors.
Screenshots of both games and their result states were inspected at 375×812;
Color Rush also passed layout assertions at 320×568 and 430×812. The real SDK
loaded in standalone dev mode; host lifecycle callbacks and purchases were
simulated locally. This does not replace physical-phone, real iframe, purchase
recovery or server verification checks. No integration files were changed and
no deployment was made. See `games/tests/README.md` to reproduce and
[CLAUDE-REVIEW.md](CLAUDE-REVIEW.md) for the next review.
