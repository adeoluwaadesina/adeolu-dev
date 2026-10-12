# Claude review — Archery and Color Rush

Date: 2026-10-12. Author: Codex. Requested by Adeolu: polish archery first, then develop Color Rush from his gameplay reference, and leave the changes for Claude to review.

## Start here

Review the actual working-tree diff, not just this note. These changes are **uncommitted on `dev`**; nothing was pushed, deployed or submitted in this session. Preserve Adeolu's work and report findings with severity, file/function and a reproducible case. Distinguish an observed defect from a question requiring real-iframe testing. Local test success is not release approval.

Read `CLAUDE.md` and `VATAR-GAMES-HANDOFF.md` for project contracts. Do not rewrite `kit/vatar-helpers.js` or `/api/` to accommodate this polish. Flag any integration change needed. Portfolio, kit, API, DB, deployment configuration, product IDs and prices were left unchanged. Documentation edits are limited to this handover, project progress and the local tracker.

```text
git status --short --branch
git diff -- games/archery/index.html games/color-rush/index.html
git diff --check
```

Also read untracked `games/tests/gameplay.cjs` and `games/tests/README.md`; ordinary `git diff` does not include new untracked files.

## What changed

### Archery — `games/archery/index.html`

- Original procedural landscape: faceted hills, layered vegetation, textured grass, range markers and a visible bow. Canvas 2D, no new assets or runtime library.
- Gold draw sweet spot around 60% power; clear strength feedback; three-arrow score strip; bow skin is visible.
- Animated flight before impact, particles, brief target shake, synthesized shot/impact sounds and mute control. The flight arc is visual; landing uses deterministic aim/wind/power offsets. Random landing error was removed; this is not a full ballistics engine.
- Simulation-time delayed effects pause with the game. SDK pause, document visibility and open panels suspend gameplay/audio. Cancelled/lost touch no longer shoots; pointer identity is tracked.
- Kept the real timeout backup for auto-release. Release recomputes power from actual hold duration even if draw animation frames stop.
- Score submission errors no longer prevent round completion. Shop/leaderboard failures have local UI handling; leaderboard names are inserted as text.

### Color Rush — `games/color-rush/index.html`

- Developed the existing prototype rather than creating a new game folder. Original perspective 4×4 platform over a lagoon and bridge skyline; actual car drawings replace the circle.
- Start screen offers solo or player + three bots. No realtime service, Vatar matches or human multiplayer was added.
- Fixed-step arcade motion at 120 Hz: steering turn rate, acceleration, release braking and pairwise collision impulses. Bots react and drive toward safe tiles; they do not teleport.
- Colour name and shape remain visible through the countdown. Increasing difficulty adds colours, reduces safe tile count and increases visual tile inset.
- Animated tile drops, falling cars and splash rings. An already-started floor drop continues even after the player's fall changes the state.
- Pause/resume, audio unlock/mute, cleared joystick input on pause/release, free replay and selectable premium paints. Existing neon trail entitlement now draws a trail.
- Continue retries the failed round instead of incorrectly awarding it as survived. One continue per run remains enforced locally. Product definitions and the verification contract were not changed.

## References supplied by Adeolu

- Archery screenshot: `C:/Users/adeol/Downloads/photo_2026-10-12_15-18-00.jpg` — depth, dense foliage, lane and target presentation.
- Color Rush reel: `https://www.instagram.com/reel/DdwMykHjaUt/`. The link reader could not retrieve it. Adeolu supplied `C:/Users/adeol/Downloads/IMG_7205.MP4` instead (about 40 seconds); sampled frames were inspected in a contact sheet.
- Contact sheet: `C:/Users/adeol/vatar-polish-tools/reference.jpg`. The reference shows a floating colour grid, persistent colour instruction, cars holding safe tiles and the other tiles dropping over water. Its larger player count was not copied; our cap is four.
- No reference art, logos, music or video was embedded in either game. Current visuals are stylized procedural 2D/perspective, not the reference's full 3D rendering. Adeolu's aesthetic acceptance remains to be confirmed.

## Validation and reproduction

The local suite passed **31 checks**, with zero page runtime errors and a clean `git diff --check` after the implementation. Coverage includes ring scoring, cancelled input, auto-release without draw RAF, flight pause/resume, rejected score submission, ladder progression, four-car cap, persistent cues, joystick release/braking, safe and unsafe tiles, completed drop animation, continue/replay and premium paint options.

Both games and result screens were visually inspected at 375×812. Color Rush layout assertions also ran at 320×568 and 430×812. These are desktop Edge emulation, not physical iPhone/Android tests. The suite loads the real remote SDK outside the iframe, then exercises the kit's dev fallback. Lifecycle checks invoke registered callbacks; purchases are simulated. No real payments, delivery, DB persistence or multiplayer were tested.

```powershell
# Existing Playwright installation on this machine; use another installed path if needed.
$env:PLAYWRIGHT_MODULE = 'C:/Users/adeol/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'
$env:GAME_QA_OUTPUT = 'C:/Users/adeol/vatar-polish-tools'
$env:GAME_QA_BROWSER = 'msedge'
node games/tests/gameplay.cjs
```

Hooks are injected into the local test server's HTML responses only, not shipped in source. Some state-machine checks place cars or trigger shots directly; complement them with ordinary touch playtests and longer runs.

Local evidence, outside the repo:

- `C:/Users/adeol/vatar-polish-tools/results.json`
- `archery.png`, `archery-result.png`, `color-rush.png`, `color-rush-result.png` in that same directory.
- Preview helper: `node C:/Users/adeol/vatar-polish-tools/serve.cjs`, then `http://127.0.0.1:4177/games/archery/` or `/games/color-rush/`. It was left running at handover; restart if needed. It serves the actual game files without test hooks.

The in-app browser tool failed due to missing sandbox metadata; standalone Playwright/Edge worked. PowerShell tool calls stalled, so Codex used `cmd.exe` with the explicit repo working directory. Permission escalation was needed for some local directory writes, browser launch and video-frame extraction. No dependencies were installed and no deployment tools were used.

## Focused review requests

1. **Lifecycle and async completion:** background/resume in the real iframe during draw, arrow flight, delayed round completion, a falling platform and a payment sheet. Check nested SDK pause/document visibility/panels, sound unlocking on iOS, stale callbacks if a round changes during a pending network call, and repeated pause/resume. Local callbacks alone cannot prove host integration.
2. **Colour Rush support geometry:** compare `tileInset()`, `project()`, `steer()` and collision push-offs. The safe-colour branch currently permits the car centre near the full tile boundary even though rendered tiles shrink; decide whether that support allowance matches the visible safe area. Exercise gaps, corners, different frame rates and long/high-round bot sessions. The 60-grid test asserts a safe tile exists; it does not prove every tile is reachable under steering dynamics.
3. **Score/save failure semantics:** rejected submissions now allow play to finish, but there is no retry queue. Submission is inside the new-best path, and restored best scores initialize `lastSubmittedScore`. Check whether `too_soon` or network failure can leave the leaderboard behind the saved best. Also inspect `saveGame` responses with `{ok:false}`, since catching Promise rejection alone does not cover every application error. Flag contract changes rather than rewriting the kit.
4. **Purchase restore and cosmetics:** real cancellation, delayed delivery, refresh/recovery, expert unlock, trail and paint selection. Both games retain the existing ordering that calls `recoverPendingPurchases()` before registering `onClaim`; verify whether freshly recovered items reach the local owned state. Color Rush's consumable handler and the generic dev-product fallback deserve special scrutiny. Paid consumable persistence/recovery was not redesigned. Paint selection is currently in-memory; ownership still uses the existing restore flow.
5. **Game feel and rendering:** thumb reach, aiming sensitivity, readable distant targets, car braking/turn radius, bot fairness, low-end device performance, colour/symbol legibility and muted/reduced-motion expectations. Confirm the polish meets Adeolu's references before treating it as visually final. Existing listing screenshots have not been refreshed.
6. **Maintainability and tests:** new rendering code is compact and some CSS overrides older rules. Review readability, duplicated/inactive markup and test determinism. New tests are outside a package script and require installed Playwright/Edge; no project dependency or build pipeline was added.

The points above are review targets and explicit limitations, not claims that each scenario is broken. If you change code, rerun relevant checks and inspect fresh screenshots. Update this note with confirmed findings and resolved items.

## Release state

The original handoff reports earlier real sandbox passes for tap-tap-lagos and archery. Do not apply that historical evidence to these modified versions automatically. Color Rush's portal registration, credentials and submission state were not inspected. Real iframe validation, final listing captures and a reviewed deployment remain outstanding. `TRACKER.md` is intentionally ignored by Git; this note and the progress section in `CLAUDE.md` preserve the review context in versionable files.
