// Shared kit for every Vatar Games game. Load the real SDK first:
//   <script src="https://lagoslife.app/sdk/vatar-games-v1.js"></script>
//   <script src="/kit/vatar-helpers.js"></script>
//
// Usage:
//   const vg = await VatarKit.init('color-rush');
//   vg.onClaim(productId => { ...unlock... });
//   await vg.claim(productId);

(function () {
  const API_ROOT = '/api';

  function mockPlayer() {
    return {
      player: { id: 't_dev_local', name: 'Dev Player', avatar: null },
      session: 'dev-session',
      mode: 'test',
      devMode: true,
    };
  }

  class VatarKit {
    constructor(game, init) {
      this.game = game;
      this.player = init.player;
      this.mode = init.mode;
      this.devMode = !!init.devMode;
      this._audioUnlocked = false;
      this._pauseHandlers = [];
      this._resumeHandlers = [];
      this._claimHandlers = [];

      this._wireAudioUnlock();
      this._wirePause();
    }

    static async init(game) {
      let init;
      try {
        init = await Vatar.init();
      } catch (err) {
        if (err && err.code === 'not_framed') {
          console.warn('[VatarKit] not framed, using dev-mode mock player');
          init = mockPlayer();
        } else {
          throw err;
        }
      }
      return new VatarKit(game, init);
    }

    // --- audio unlock: only start audio after the player's first tap ---
    _wireAudioUnlock() {
      const unlock = () => {
        this._audioUnlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    get audioUnlocked() {
      return this._audioUnlocked;
    }

    // --- pause/resume: stop timers and audio on pause ---
    _wirePause() {
      if (this.devMode) return;
      Vatar.onPause(() => this._pauseHandlers.forEach((fn) => fn()));
      Vatar.onResume(() => this._resumeHandlers.forEach((fn) => fn()));
    }

    onPause(fn) {
      this._pauseHandlers.push(fn);
    }

    onResume(fn) {
      this._resumeHandlers.push(fn);
    }

    // --- fresh session token, required before every call to our server ---
    async _session() {
      if (this.devMode) return 'dev-session';
      return Vatar.session();
    }

    // --- purchases ---
    async purchase(productId) {
      if (this.devMode) {
        console.warn('[VatarKit] dev mode: simulating purchase', productId);
        return this._completeClaim(`dev_${productId}_${Date.now()}`);
      }
      const { purchaseId } = await Vatar.purchase(productId);
      return this._completeClaim(purchaseId);
    }

    async _completeClaim(purchaseId) {
      if (this.devMode) {
        this._claimHandlers.forEach((fn) => fn('dev_product'));
        return { ok: true, productId: 'dev_product' };
      }
      const session = await this._session();
      const res = await fetch(`${API_ROOT}/claim?game=${this.game}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, purchaseId }),
      });
      const data = await res.json();
      if (res.ok) this._claimHandlers.forEach((fn) => fn(data.productId));
      return data;
    }

    onClaim(fn) {
      this._claimHandlers.push(fn);
    }

    // Recover purchases paid but not yet delivered (e.g. after a reload).
    async recoverPendingPurchases() {
      if (this.devMode) return [];
      const pending = await Vatar.purchases();
      const results = [];
      for (const p of pending) {
        results.push(await this._completeClaim(p.purchaseId));
      }
      return results;
    }

    // --- restore owned items + save ---
    async restoreOwned() {
      if (this.devMode) return { playerId: this.player.id, owned: [], save: null };
      const session = await this._session();
      const res = await fetch(
        `${API_ROOT}/owned?game=${this.game}&session=${encodeURIComponent(session)}`
      );
      return res.json();
    }

    async saveGame(save) {
      if (this.devMode) {
        console.warn('[VatarKit] dev mode: skipping save', save);
        return { ok: true };
      }
      const session = await this._session();
      const res = await fetch(`${API_ROOT}/owned?game=${this.game}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, save }),
      });
      return res.json();
    }

    // --- score + leaderboard ---
    async submitScore(n) {
      if (this.devMode) return { ok: true };
      return Vatar.submitScore(n);
    }

    async leaderboard() {
      if (this.devMode) return { top: [], me: { label: 'You' } };
      return Vatar.leaderboard();
    }

    // Minimal, themeable leaderboard list. Games can style `.vg-leaderboard`.
    async renderLeaderboard(container) {
      const { top, me } = await this.leaderboard();
      container.innerHTML = '';
      const list = document.createElement('ol');
      list.className = 'vg-leaderboard';
      top.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = `${row.name ?? row.playerId} — ${row.score}`;
        list.appendChild(li);
      });
      container.appendChild(list);
      if (me) {
        const meRow = document.createElement('p');
        meRow.className = 'vg-leaderboard-me';
        meRow.textContent = me.label;
        container.appendChild(meRow);
      }
    }
  }

  window.VatarKit = VatarKit;
})();
