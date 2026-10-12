# Gameplay checks

`gameplay.cjs` exercises Archery and Color Rush at phone sizes using a temporary local server and Playwright. It loads the real remote Vatar SDK and the unchanged shared kit in standalone dev mode. Host pause/resume is simulated by invoking the registered kit callbacks. Purchase checks use the kit's dev simulation; they do not verify live payments or server delivery.

With Playwright installed:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:GAME_QA_BROWSER = 'msedge'
node games/tests/gameplay.cjs
```

Screenshots and `results.json` are written to the OS temporary directory under `vatar-gameplay`. Set `GAME_QA_OUTPUT` to override it. Test hooks are injected only in the test server's HTML responses, not saved in game source.

Checks cover scoring rings, cancelled input, auto-release without draw animation frames, arrow flight pause/resume, score submission failure, tier progression, four-car cap, persistent colour cues, steering input release and braking, safe/unsafe tiles, falling animation, one continue per run, free replay, premium paint selection and 320/375/430px layouts.

The games remain self-contained HTML with procedural visuals/audio and no new runtime dependencies. Integration files and product IDs are unchanged. Repeat the real Vatar sandbox review before release.
