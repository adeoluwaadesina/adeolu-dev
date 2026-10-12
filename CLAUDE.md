# Vatar Games Studio — project brief

HTML5 games for the **Vatar Games platform** (the Games app inside Lagos Life, lagoslife.app), living inside the `adeolu-dev` repo under `/games/`.
Goal: **10 approved, monetised games by 31 Oct 2026.** Build one shared kit, then each game is just game logic + a product list.

**This repo also hosts Adeolu's personal portfolio at the site root** (`index.html`, `styles.css`, `script.js` etc. at the repo root — untouched by games work). One repo, one Vercel project, one domain (`adeolu.xyz`): portfolio at `/`, games at `/games/<slug>/`. Keep games work scoped to `/games/`, `/kit/`, `/api/`, `/db/` — don't touch the root-level portfolio files unless asked.

Source of truth (re-read when unsure):
- Docs: https://lagoslife.app/developers/docs
- Agreement v1.0: https://lagoslife.app/developers/agreement
- Sample (Tap Tap Lagos): https://lagoslife.app/developers/sample

## How the platform works
- Our game runs on OUR HTTPS domain. Lagos Life frames it in a sandboxed iframe.
- The game loads `<script src="https://lagoslife.app/sdk/vatar-games-v1.js"></script>`. Always load it from there, never a local copy.
- Our server holds the secret key, verifies purchases with Vatar's API, gives the item, then marks it delivered.
- API base: `https://lagoslife.app/api/games/v1`, with header `Authorization: Bearer vtr_test_…` (sandbox) or `vtr_live_…` (after approval).

## SDK (every call returns a Promise; errors have `.code`)
- `Vatar.init()` → `{ player:{id,name,avatar}, session, mode }`. `player.id` is a per-game pseudonym (`t_…` test, `p_…` live).
- `Vatar.session()` → a fresh 15-minute token. Get one before every call to our server.
- `Vatar.purchase(productId)` → `{purchaseId, productId}`. Opens Vatar's pay sheet. One sheet at a time, one call every 3 s.
- `Vatar.onPurchase(fn)` and `Vatar.purchases()` → recover purchases that are paid but not yet delivered (e.g. after a reload).
- `Vatar.submitScore(n)` (one per player every 20 s; sooner is `too_soon`) and `Vatar.leaderboard()` (top 50 + `me.label`).
- `Vatar.onPause` / `Vatar.onResume` → stop timers and audio on pause.
- `Vatar.match.create/join/quick/current/leave/onUpdate`
  - Multiplayer for 2–4 players.
  - The result is posted ONLY from our server, signed with HMAC-SHA256 using `VATAR_RESULTS_SECRET`.

## Server API
- `POST /session/verify {session}` → `{playerId, name, gameId, exp, mode}`
- `GET /purchases/{id}` → `{productId, playerId, amount, status: paid|delivered|refunded, mode}`
- `POST /purchases/{id}/deliver` → idempotent.
- Claim flow:
  1. verify the session
  2. GET the purchase
  3. check `purchase.playerId === session.playerId` and that status is not refunded
  4. grant the item ONCE per `purchaseId` in our DB
  5. call deliver
- Webhook (optional):
  - Header `X-Vatar-Signature: sha256=<hex HMAC of raw body with vtr_whsec_…>`. Compare in constant time.
  - It's only a nudge. Always re-check the purchase with GET.
  - Dedupe by event id.
  - Must be our own domain, HTTPS on port 443. No IPs, no `*.workers.dev`.

## IMPORTANT gotcha
`purchases()` only returns UNDELIVERED purchases, and cookies/localStorage are unreliable in the third-party frame.
→ Ownership and saves MUST live in our DB, keyed by `(game_slug, player_id)`.
→ On init, the game asks our server what the player owns.

## Review checklist — every game must pass
1. The sandbox integration checklist is fully ticked:
   - init seen
   - a test purchase made
   - the purchase verified by our server
   - one purchase marked delivered
   - (multiplayer games only) a test match created, joined and its result posted by our server
2. Response header `Content-Security-Policy: frame-ancestors https://lagoslife.app https://www.lagoslife.app https://naijalife.app https://www.naijalife.app https://lagoslife.eliysites.com`. No `X-Frame-Options`.
3. Phone-first at 375×812 portrait, touch only, no hover-only controls.
4. Loads fast on mobile data.
5. Pauses on `onPause`. Audio starts only after the player's first tap.
6. Not allowed inside the frame: fullscreen, `alert`/`confirm`/`prompt`, popups, `window.open`, downloads, camera, mic, location or clipboard.
7. Products:
   - whole naira, ₦100–₦50,000
   - at most 20 per game
   - honest names
   - no fake timers or dark patterns
   - product ids use a–z, 0–9, `_` and `-`, at most 32 characters
8. Listing:
   - 512px square icon (PNG, JPEG or WebP — not SVG)
   - 3–5 screenshots
   - short description of 120 characters or less
   - honest long description
9. Never allowed:
   - gambling or real-money prizes
   - external payment links
   - ad networks or tracking
   - collecting personal data
   - adult content
   - real brands, logos, songs or celebrities
   - Stakes may use ONLY Lagos Life's in-game money, via `Vatar.match`.
10. The URL and webhook are locked once approved. Changing them sends the game back to review, so use the final domain from day one.

## Money
- We earn 70% of each sale.
- Paid monthly by the 15th of the following month, once the balance is at least ₦5,000.
- IAP is the only real-money income. Match stakes earn us in-game money only.
- Default pricing:
  - one-off unlock: ₦300–₦1,000
  - cosmetics: ₦100–₦500
  - consumables (continue, extra life): ₦100–₦200
  - Every game gets a leaderboard.

## Architecture
```
/index.html, /styles.css, /script.js, ...   # Adeolu's personal portfolio — not games work, leave alone
/games/index.html           # games landing page
/games/<slug>/index.html    # one folder per game; plain HTML/JS or Phaser, mobile-first
/games/<slug>/products.json
/kit/vatar-helpers.js       # shared: init, pause/resume, audio unlock, claim, restore owned, leaderboard UI
/api/claim.js               # POST ?game=slug — verify + grant + deliver (secret from env VATAR_SECRET_<SLUG>)
/api/owned.js                # GET owned items/save for (game, player) after verifying the session
/api/webhook.js              # optional, verifies the signature, dedupes
/api/match-result.js         # for multiplayer games
/db/schema.sql               # Neon Postgres: grants(game, player_id, product_id, purchase_id UNIQUE), saves
vercel.json                  # frame-ancestors header, scoped to /games/* only (not the portfolio root)
```

Hosting and data:
- Hosting: Vercel, one project, one custom domain (`adeolu.xyz`). Portfolio at `/`, games at `/games/<slug>/`. No cross-project proxy — these are native paths in the same deployment.
- DB: Neon serverless Postgres (free tier). Connect with `@neondatabase/serverless` from the Vercel functions, using the `DATABASE_URL` env var. Neon's Vercel integration can set that variable automatically.
- Secrets: env vars only. Never put them in client code.

## Conventions
- Each game is self-contained, lightweight, and has no heavy build step unless needed.
- Original art and audio only. Prefer procedural, code-drawn or CC0 assets.
- Every game has a "dev mode" that runs outside the frame. `init` throws `not_framed` there, so fall back to a mock player for local testing.
- Lagos flavour is the edge: local settings, humour, Pidgin.

## Games
Adeolu supplies the game concepts. Don't propose a slate; build what he describes. `tap-tap-lagos` (the sample) is used only to prove the kit.
All art, names and audio must be ORIGINAL. Reference games are for mechanics only: never copy their names, art, characters or levels.

### Multiplayer reality check (applies to every MP game)
- `Vatar.match` only does lobbies, stakes and results, with 2–4 seats. It does NOT sync gameplay.
- Real-time gameplay needs OUR OWN realtime server. Vercel functions can't hold WebSockets.
  - Use Colyseus (Node) on Fly.io or Railway, or PartyKit / Cloudflare Durable Objects, behind our own domain (e.g. `rt.<domain>`).
- The server is authoritative: it decides the winner, then posts the signed result to `/matches/{id}/result`.
- **Max 4 players in EVERY game.** This is a hard cap; Vatar matches are 2–4 seats anyway.
- **Each game is built in three stages, in this order:**
  1. **Solo** — the core game works on its own.
  2. **Solo vs bots** — empty seats (up to 4 total) are filled with AI.
  3. **vs players** — real players via `Vatar.match` + the realtime server. Bots still fill empty seats.
- Ship a game at stage 1 or 2 if it's fun there. Stage 3 can come in a later update.
- Build ONE realtime server template and reuse it across all the MP games.

### 1. Color Rush — `color-rush`
- **Reference:**
  - Roblox "Color Block Floor": players run to the chosen colour, the other blocks disappear, last player standing wins.
  - Same idea as Fall Guys "Block Party". Adeolu's twist: cars, not characters.
- **Concept:** 4 cars (max) on a floating grid of coloured squares. Each round:
  1. a colour is announced (text + colour + shape icon, for colour-blind players)
  2. a countdown runs
  3. every tile that isn't that colour drops away
  4. cars not on a safe tile fall
  5. tiles return and the next round starts
- **Escalation:**
  - shorter countdowns
  - fewer and smaller safe tiles
  - more colours
  - bumping between cars (physics push-offs)
  - later: power-ups such as nitro, a shield, or a "freeze others"
- **Mode:**
  - Solo: survive the rounds alone (score = rounds survived).
  - vs bots: you + 3 bots.
  - vs players: up to 4 via `Vatar.match`.
- Smaller grid to suit 4 cars, so bumping fights for the last safe tile matter more.
- **Tech:** top-down or 3/4 view. Canvas 2D or Phaser with simple arcade car physics. Touch controls: virtual joystick, or tap-to-steer.
- **Monetisation:**
  - car skins and trails: ₦100–₦300
  - a "second chance" respawn once per game: ₦100 consumable
  - a premium car pack: ₦500
- **Leaderboard:** rounds survived.

### 2. Carry the Glass — `carry-the-glass`
- **Reference:**
  - "Carry The Glass" (SlugShot Games, Steam): a 2-player co-op platformer where two construction workers carry a fragile window up a tall structure without breaking it.
  - The Roblox "Carry the Glass Together!" 2-player obby (thousands of concurrent players) adds tilting the glass through gaps, swinging hammers and checkpoints.
- **Our version:**
  - 2D side-view physics climb up a Lagos high-rise under construction.
  - Two workers carry a glass pane. Too much tilt, stress or impact cracks it, then shatters it.
  - Checkpoints by floor.
- **Mode:**
  - Solo: control both workers with two thumbs (left side = worker A, right side = worker B). This is chaotic and funny, and it's the default.
  - Co-op: 2 humans via `Vatar.match` (stake 0) plus the realtime server.
- **Tech:** Matter.js or Planck.js physics. Server-authoritative physics for co-op is hard, so start solo.
- **Monetisation:**
  - continue from the last checkpoint: ₦100 consumable
  - unlock all buildings: ₦500
  - worker outfits: ₦100–₦300
- **Leaderboard:** highest floor reached.

### 3. Can I Hit??? — `can-i-hit`
- **What it is:** a dodgeball game.
- **Reference:** "Bodgeball" by bodgeware (Steam), seen in the reel.
  - First-person 1v1 dodgeball in an indoor arena with a crowd.
  - Walk to a ball and pick it up, then throw.
  - Getting hit, or having your throw caught, puts you out ("X caught Y").
  - First to N round wins. Short rounds.
- **Our version (phone-first):**
  - 3rd-person or top-down arena rather than first-person. FPS controls are hard on touch.
  - Controls:
    - left thumb: move
    - tap a ball: pick it up
    - swipe/drag-release: aim and throw
    - tap at the right moment as a ball arrives: catch
    - dodge button
  - Rules: hit = out; catch = the thrower is out.
  - Best of 3 rounds, with a round timer.
- **Modes:**
  1. Solo: target/reaction challenge mode.
  2. vs bots: 1v1, 2v2.
  3. vs players: up to 4 via `Vatar.match`.
- **Tech:** start as a 2D top-down arena (Canvas/Phaser). Optional upgrade to three.js later.
- **Original art only:** don't copy Bodgeball's blob characters or name.
- **Monetisation:**
  - ball skins and outfits: ₦100–₦300
  - arena themes: ₦300
- **Leaderboard:** wins.

### 4. Act Normal — `act-normal`
- **Reference:**
  - "Act Normal" (Steam, coming soon): thieves blend in among AI bots, mimic NPC movement, and steal as much loot as they can without blowing their cover.
  - Its "Steal or Die" mode: every player is a thief with a hidden weapon, and the poorest thief is eliminated at regular intervals.
  - Similar games: North Hunt, Agent Versus.
- **Concept (Adeolu):**
  - Everyone looks like an NPC in a busy Lagos market. Blend in and steal loot.
  - Spot which "NPCs" are really players and take them out before they find you.
  - Every minute, whoever has stolen the least is eliminated.
  - No warnings, no visible leaderboard during the round.
- **Content guardrail (Agreement §4c):**
  - Use a cartoon "tag"/"bust" tool, e.g. a whistle, a slapstick, a paint splat. No guns, no gore.
  - Eliminated players get "caught" or "kicked out of the market", not killed.
- **Mode:**
  - Max 4 real "players" (human or bot). The NPC crowd doesn't count toward the cap.
  - Order: solo vs 3 bot "players" first, then vs real players.
- **Tech:** top-down 2D. Bot NPCs need believable wander/stop/browse behaviour, because that's what players must mimic. The server is authoritative over loot and eliminations.
- **Biggest build.** Schedule it last.
- **Monetisation:**
  - NPC disguise skins: ₦100–₦300 (cosmetic only, and must not give a gameplay advantage)
  - premium market maps: ₦500
- **Leaderboard:** wins.

### 5. Don't Pull Me! — `dont-pull-me`
- **Reference:** "Don't Pull Me!" (Steam, demo): a physics co-op parkour game for 1–4 players. Players are tied together by a rope, climbing and swinging across obstacles without dragging the team down.
- **Our version:**
  - 2D side-view ragdoll climber, 2–4 characters linked by a rope.
  - If one falls, they drag the others. Swing them back up.
- **Mode:**
  - Solo: you control the lead climber, and AI teammates follow (and occasionally mess up, for comedy).
  - Co-op: up to 4 via `Vatar.match` (stake 0).
- **Tech:** Matter.js or Planck.js rope constraints. Shares its physics core with Carry the Glass, so build them back to back.
- **Monetisation:**
  - rope skins and outfits: ₦100–₦300
  - continue: ₦100
  - level packs: ₦500
- **Leaderboard:** height or distance.

### 6. Dispatch Rider — `dispatch-rider`
- **Concept (Adeolu):** you're a food-delivery rider on a bicycle across Lagos Island.
  - Pick up orders and deliver them to customers before the timer runs out.
  - Random obstacles: potholes, danfos pulling out, hawkers, puddles, keke, a road blocked by a party.
- **Loop:**
  - Order card (pickup → drop-off) → ride → deliver → tip + rating.
  - Fragile orders (soup!) spill if you hit too many bumps.
  - Day/shift structure. Earn in-game naira to upgrade the bike.
- **Tech:** top-down scrolling city or a lane-based runner. Simplest that's fun = lane runner with branching streets. Use original area-style names only, not real business names.
- **Monetisation:**
  - bike upgrades and skins: ₦100–₦500
  - "rush hour pass" for unlimited shifts: ₦500 one-off
- **Leaderboard:** deliveries in a shift.

### 7. Whot (Doyin's rules) — `whot`
- **Base:** Nigerian Whot.
  - 54 cards in five symbols (circle, cross, star, triangle, square) plus wild "Whot" cards numbered 20.
  - Match the call card's symbol or number, play a Whot, or draw from the market.
  - Common Nigerian specials:
    - 1 = hold on (play again)
    - 2 = pick two
    - 5 = pick three
    - 8 = suspension
    - 14 = general market
    - star cards count double when scoring
  - These vary by house rules.
- **For now: basic Nigerian Whot** with the common specials listed above.
- "Doyin's rules" come later. Build the rules as a config object, so a new preset is easy to add without a rewrite.
- **Mode:** solo vs bots (smart AI) + MP 2–4 via `Vatar.match` (turn-based, so it's the easiest MP game; good first MP title). Game-money stakes allowed via `Vatar.match` only.
- **Monetisation:**
  - card-back and table themes: ₦100–₦300
  - "pro AI" opponents: ₦300
- **Leaderboard:** wins.

### 8. Street Racer (working title) — `street-racer`
- **Reference:** Asphalt-style arcade racing.
  - nitro boosts, drifting, takedowns
  - short races
  - car collection and upgrades
- **Tech:**
  - 3D low-poly with three.js, kept small for mobile data.
  - Alternative: pseudo-3D (OutRun-style) on canvas is far lighter and faster to build. Prototype pseudo-3D first.
- **Controls:** auto-accelerate, tilt or touch-left/right to steer, tap for nitro, swipe for drift.
- **Monetisation:**
  - cars: ₦300–₦1,000 (one-off)
  - paint and decals: ₦100–₦300
  - no pay-to-win upgrades in leaderboard modes
- **Leaderboard:** best lap / time-trial.

### 9. Score Hero-style football — `score-hero` (working title)
- **Reference:** Score! Hero (First Touch Games).
  - Each level is a frozen moment of a match.
  - Swipe to draw the ball's path to pass or shoot. Swipe length and angle control power and curve.
  - Story mode: rise from unknown player to club and national-team star. Each level has 3 star objectives (e.g. "top corner", "assist with your hero").
- **Status: Adeolu wrote "make a score hero game but…". The twist is MISSING. Ask him.**
- **Avoid:** real clubs, leagues, player names and badges. Use original teams (e.g. a fictional Lagos league).
- **Tech:** 2D top-down pitch + swipe path drawing + simple ball physics (curve) + defender interception checks.
- **Monetisation:**
  - continues (Score Hero uses energy, but we'll avoid aggressive energy walls under §4j): ₦100
  - hero customisation: ₦100–₦300
  - season unlock: ₦500
- **Leaderboard:** stars total.

### 10. Archery — `archery`
- **Reference:** iMessage GamePigeon Archery.
  - Three rounds; win two to win the game.
  - Wind speed and direction (shown above the target) must be factored into each shot.
- **Mechanics:**
  - Pull back to draw, aim the reticle.
  - Wind shown as an arrow + speed. Gravity drop over distance.
  - Targets: 10 rings scoring 10 to 1.
  - Later stages: moving targets and obstacles.
- **Mode:** solo ladder (beginner → expert) + 1v1 via `Vatar.match` (best of 3, turn-based; easy MP).
- **Monetisation:**
  - bows and arrow trails: ₦100–₦300
  - expert-stage unlock: ₦300
- **Leaderboard:** best total.

### 11. Naija Farm Tycoon (working title) — `naija-farm`
- **Concept (Adeolu):** grow from a small plot to a huge agro-empire, like SimCity for Nigerian farms.
  - **Crops:** cassava, yam, maize, rice, tomatoes, pepper, cocoa, plantain, groundnut.
  - **Animals:** poultry, goats, cattle, fish ponds, snail farm.
  - **Processing:** garri, palm oil, feed mill.
  - **Events:** rainy/dry seasons, harmattan, market price swings, pests, NEPA outages (gen fuel), transport to markets.
- **Loop:** plant → tend → harvest → sell at market prices → expand land → hire workers → automate → process for higher margins.
- **Tech:** isometric or top-down tile grid. Saves MUST be in Neon (keyed by `player_id`). Offline progress calculated server-side on return.
- **Monetisation:**
  - permanent 2× growth: ₦1,000
  - premium buildings and animals: ₦300–₦1,000
  - speed-ups: ₦100–₦200
  - Keep it fair: no fake timers or dark patterns (§4j).
- **Leaderboard:** farm value.

### 12. Crazy 8s-style card game — `last-card` (working title)
- **Reference:** iMessage GamePigeon Crazy 8 / UNO-style shedding game, 2–4 players.
- **Naming:** don't use the UNO name, logo or card designs (Mattel trademark). Use an original name and an original card style.
- **Basic rules (classic Crazy Eights):**
  - Deal 7 cards each (5 when there are 2 players).
  - Match the top card's suit or rank. Otherwise draw one, and you may play it if it fits.
  - 8 is wild: play it any time and choose the next suit.
  - The first player to empty their hand wins the round.
  - Optional scoring across rounds: 8 = 50, picture cards = 10, others = face value. First to a target total wins.
- **Optional UNO-style action cards** (rules config, OFF by default): skip, reverse, draw-two.
- **Shared code:** the same card engine as Whot (deck, hand, turn order, rules config, bot AI). Build Whot first, then this is mostly a reskin plus a rules preset.
- **Modes:**
  1. vs bots: 1–3 bots.
  2. vs players: up to 4 via `Vatar.match`. Turn-based, so it's an easy MP build.
- **Monetisation:**
  - card-back and table themes: ₦100–₦300
  - a "house rules" pack (action cards, stacking): ₦300
- **Leaderboard:** wins.

### Priority (by Oct 31)
Solo first → then vs bots → then vs players (see the three-stage rule above).
1. archery
2. color-rush
3. dispatch-rider
4. whot (basic Nigerian rules; first MP via the shared card engine)
5. last-card (reuses the card engine)
6. can-i-hit
7. street-racer (pseudo-3D)
8. score-hero
9. carry-the-glass
10. dont-pull-me
11. naija-farm
12. act-normal

Open questions:
- score-hero: what's the twist?
- whot: Doyin's rules (to come later).

## Assets & design
- Icons, key art and listing screenshots:
  - Higgsfield is connected in the Claude app and can generate original images.
  - Final screenshots must be real gameplay at 375×812.
- Game art: code-drawn shapes, procedural art, or CC0 packs (e.g. Kenney.nl). Keep each game small.
- Every game must be checked visually. Run it in a headless browser (Playwright) at 375×812, take screenshots, and look at them before calling it done.

## Build order
1. Kit, server, DB and headers. Push `tap-tap-lagos` through the sandbox until the checklist is all ticked, then submit.
2. Submit each game as soon as it's done. Don't batch, since review time is unknown.

## Track progress here
| Game | Status | Submitted | Approved | Notes |
|------|--------|-----------|----------|-------|
