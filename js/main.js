// App: wires the rules (Econ, Fishing) to the screen (Scene, UI), the save
// (Storage) and the speakers (Sfx, Music).
//
// The frame loop is split from its scheduler — start() only schedules and
// frame(t) only does the work — so a test harness can step frames by hand
// without ever starting a second requestAnimationFrame chain.

const AVATARS = ["🎣", "🐟", "🦀", "🐙", "🐳", "⚓", "⛵", "🦭", "🐧", "🦩", "🐢", "🦈"];
const SAVE_EVERY = 3;          // seconds between background saves
const COACH = [
  "Tap CAST to throw out your line! 🎣",
  "Wait for the bobber to dip…",
  "Hold to reel in, let go to give line. Keep the white marker in the green!",
  "Nice catch! Catch a few more, then sell your haul 🧺",
  "Spend your money in the Shop 🛒",
];

const App = {
  profile: null,
  S: null,
  ev: null,                 // the running event: { ...def, left, casts, bestKg, bestId }
  sinceEvent: 0,
  shownCash: 0,
  raf: 0, last: 0, clock: 0,
  saveTimer: 0, dirty: false,
  hudTimer: 0,
  stormTimer: 0,
  earlyShown: 0,
  token: 0,
  prefs: null,

  el(id) { return document.getElementById(id); },

  // The HUD refreshes ten times a second; only touch the DOM when the markup changed.
  setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } },

  init() {
    this.prefs = Storage.prefs();
    Sfx.enabled = this.prefs.sound !== false;
    Volume.music = this.prefs.music; Volume.sfx = this.prefs.sfx;
    this.applyMotion();
    GK.UI.bindSoundToggle(Storage);
    GK.UI.bindMenuClicks();
    GK.UI.onScreenChange = (name) => this.onScreen(name);

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => {
        const s = Econ.normalize(prog);
        return `💰 ${fmtMoney(s.cashEarned)} earned · 📖 ${Object.keys(s.journal).length}/${CATCHES.length}`;
      },
      onEnter: (p) => this.enter(p),
      addLabel: "New Angler",
    });

    GK.initPWA({ appName: "Fishing Tycoon" });
    Scene.init(this.el("cv"));
    this.bindFishing();
    this.bindInput();
    this.bindButtons();
    this.bindSettings();
    this.drawSplashArt();

    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
    document.addEventListener("visibilitychange", () => this.onVisibility());
    window.addEventListener("pagehide", () => this.save(true));
    const reflow = () => { Scene.resize(); setTimeout(() => Scene.resize(), 350); };
    window.addEventListener("resize", reflow);
    window.addEventListener("orientationchange", reflow);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", reflow);

    GK.Debug.init({ storage: Storage, title: "FISHING TYCOON" })
      .action("+$10,000", () => this.cheat(10000))
      .action("+$1,000,000", () => this.cheat(1e6))
      .action("+$100,000,000", () => this.cheat(1e8))
      .action("golden hour", () => this.startEvent(EVENT.golden))
      .action("storm", () => this.startEvent(EVENT.storm))
      .action("lucky day", () => this.startEvent(EVENT.lucky))
      .action("ripple", () => this.startEvent(EVENT.ripple))
      .action("competition", () => this.startEvent(EVENT.comp))
      .action("huge shadow", () => this.startEvent(EVENT.shadow))
      .action("fill journal", () => { for (const c of CATCHES) this.S.journal[c.id] = this.S.journal[c.id] || { n: 1, kg: c.kg[1], val: c.value, gold: 0, first: Date.now() }; })
      .action("away 3 hours", () => { this.S.lastSeen -= 3 * 3600 * 1000; this.checkOffline(); });

    this.showScreen("splash");
    this.start();

    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (!ok) return;
      if (GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (GK.UI.screen === "splash") this.refreshSplash();
      if (this.profile) {
        // Pick up anything another device did, without losing this session.
        this.S = Econ.merge(this.S, Storage.load(this.profile.id));
      }
    });
  },

  cheat(n) { if (this.S) { Econ.earn(this.S, n); this.refreshAll(); } },

  showScreen(name) { GK.UI.showScreen(name); },

  onScreen(name) {
    if (name === "splash") this.refreshSplash();
    if (name === "game") {
      Scene.resize(); setTimeout(() => Scene.resize(), 400);
      this.measureInsets();
      this.hud(true);
    }
    if (name === "business") setTimeout(() => UI.sizeHarbour(), 50);
    if (name !== "game") Fishing.release();
  },

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🎣 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch Player";
    } else {
      cont.style.display = "none";
      start.className = "btn big sun";
      start.textContent = "🎣 Start Fishing";
    }
  },

  play() {
    Sfx.init();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  switchPlayer() {
    this.save(true);
    GK.UI.closeModal("modal-settings");
    Music.stop();
    this.profile = null; this.S = null; this.ev = null;
    Fishing.reset();
    this.play();
  },

  /* ------------------------------------------------------------ entering the game */

  enter(p) {
    this.token++;
    this.profile = p;
    this.S = Storage.load(p.id);
    this.ev = null; this.sinceEvent = 0;
    Fishing.reset();
    this.shownCash = Econ.cash(this.S);
    Music.setLocation(LOCATION[this.S.loc]);
    this.showScreen("game");
    const away = this.checkOffline();
    if (!away) this.save(true);
    this.coach();
    if (this.prefs.music > 0) Music.start();
  },

  checkOffline() {
    const S = this.S;
    const before = Econ.cash(S);
    const r = Econ.offline(S, Date.now());
    this.save(true);
    if (!r || r.earned <= 0 || r.sec < 60) return false;
    this.shownCash = before;
    this.el("away-text").textContent = `You were away for ${fmtDuration(r.raw)}. Your crew kept fishing and your business earned:`;
    this.el("away-amount").textContent = fmtMoney(r.earned);
    this.el("away-note").textContent = r.capped
      ? `Your business can only earn for ${r.capHours} hour${r.capHours === 1 ? "" : "s"} while you're away. Nana Flo and Refrigerated Storage make that longer.`
      : `That's ${fmtMoney(Econ.perMin(S))} every minute.`;
    const collect = this.el("btn-collect");
    collect.onclick = () => {
      Sfx.coins(10);
      this.flyCoins(collect, this.el("money-pill"), 12);
      GK.UI.closeModal("modal-away");
    };
    GK.UI.openModal("modal-away");
    return true;
  },

  save(now) {
    if (!this.profile || !this.S) return;
    const t = Date.now();
    this.S.updated = t;
    this.S.lastSeen = t;
    try { Storage.saveProgress(this.profile.id, this.S); } catch (e) { /* storage full or blocked: keep playing */ }
    this.dirty = false;
    this.saveTimer = 0;
  },

  onVisibility() {
    if (!this.S) return;
    if (document.hidden) { this.save(true); Fishing.release(); }
    else if (GK.UI.screen !== "splash" && GK.UI.screen !== "profiles") {
      this.last = 0;
      this.checkOffline();
    }
  },

  /* ------------------------------------------------------------ the loop */

  start() {
    const loop = (t) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  },

  frame(t) {
    // Clamp BOTH ends: a backwards timestamp must never run things in reverse.
    const dt = this.last ? Math.max(0, Math.min(0.05, (t - this.last) / 1000)) : 0;
    this.last = t;
    this.clock += dt;
    if (!this.S) return;
    const screen = GK.UI.screen;

    if (Econ.tick(this.S, dt) > 0) this.dirty = true;

    if (screen === "game") {
      const blocked = document.querySelector(".modal.visible");
      if (!blocked) {
        Fishing.update(dt);
        this.updateEvent(dt);
      }
      Fx.update(dt);
      if (Scene.flying) Scene.flying.t += dt;
      Scene.draw(this.clock, this.S, this.ev, Fishing);
      this.castButton();
      if (Fishing.phase !== this.lastPhase) { this.lastPhase = Fishing.phase; if (!this._coachTimer || this.S.tut < 5) this.coachIfIdle(); }
    } else if (screen === "business") {
      UI.drawHarbour(this.clock);
    }

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) { this.hudTimer = 0; this.hud(); }
    this.animateCash(dt);

    this.saveTimer += dt;
    if (this.saveTimer > SAVE_EVERY) this.save();
  },

  /* ------------------------------------------------------------ input */

  bindInput() {
    const cv = this.el("cv");
    const down = (e) => {
      if (GK.UI.screen !== "game") return;
      e.preventDefault();
      try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) { /* synthetic ids throw */ }
      Sfx.init();
      this.press();
    };
    cv.addEventListener("pointerdown", down);
    const cast = this.el("btn-cast");
    cast.addEventListener("pointerdown", (e) => { cast.classList.add("held"); down(e); });
    const up = () => { cast.classList.remove("held"); Fishing.release(); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    cast.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard: space or enter does exactly what a tap does.
    let keyHeld = false;
    window.addEventListener("keydown", (e) => {
      if (GK.UI.screen !== "game" || document.querySelector(".modal.visible")) return;
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      if (keyHeld) return;
      keyHeld = true;
      this.press();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space" || e.code === "Enter") { keyHeld = false; Fishing.release(); }
    });
  },

  press() {
    if (document.querySelector(".modal.visible")) return;
    this.el("catch-card").hidden = true;
    Fishing.press();
  },

  bindButtons() {
    this.el("nav-shop").onclick = () => this.showShop();
    this.el("nav-journal").onclick = () => this.showJournal();
    this.el("nav-business").onclick = () => this.showBusiness();
    this.el("nav-haul").onclick = () => this.openHaul();
    this.el("btn-map").onclick = () => this.showMap();
    this.el("btn-goals").onclick = () => this.showGoals();
    this.el("btn-settings").onclick = () => this.openSettings();
    this.el("btn-sell").onclick = () => this.sell();
    this.el("chip-goal").onclick = () => this.showGoals();
    this.el("chip-target").onclick = () => {
      const tgt = Econ.nextTarget(this.S);
      if (!tgt) return this.showShop();
      if (tgt.kind === "loc") return this.showMap();
      const tr = TRACK[tgt.id];
      if (["helpers", "boats", "business"].includes(tr.cat)) { UI.bizTab = tr.cat; this.showBusiness(); }
      else { UI.shopTab = tr.cat; this.showShop(true); }
    };
    // Tapping the scrim closes the gentle modals.
    for (const id of ["modal-haul", "modal-entry", "modal-settings", "modal-help", "modal-stats", "modal-comp"]) {
      const m = this.el(id);
      m.addEventListener("click", (e) => { if (e.target === m) GK.UI.closeModal(id); });
    }
  },

  back() { this.showScreen("game"); },

  showShop(fromTarget) {
    // Open on a tab with something affordable, unless the current one has something.
    if (!fromTarget && !UI.affordable(UI.shopTab)) {
      const tab = SHOP_TABS.find((t) => UI.affordable(t.id));
      if (tab) UI.shopTab = tab.id;
    }
    UI.renderShop(); this.showScreen("shop"); this.el("screen-shop").scrollTop = 0;
  },
  showJournal(highlight) {
    if (highlight) UI.journalTab = CATCH[highlight].loc;
    else if (UI.journalTab !== "stats") UI.journalTab = this.S.loc;
    UI.renderJournal(highlight);
    this.showScreen("journal");
  },
  showBusiness() { UI.renderBusiness(); this.showScreen("business"); },
  showGoals() { UI.renderGoals(); this.showScreen("goals"); },
  showMap() { UI.renderMap(); this.showScreen("map"); },

  showLeaderboard() {
    GK.UI.closeModal("modal-settings");
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => {
        const s = Econ.normalize(r.progress);
        return `<span class="lb-stat">📖 ${Object.keys(s.journal).length}</span>
          <span class="lb-stat">⚖️ ${s.stats.bestKg ? fmtKg(s.stats.bestKg) : "—"}</span>
          <span class="lb-stat">💰 ${fmtMoney(s.cashEarned)}</span>`;
      },
      sort: (a, b) => (Econ.normalize(b.progress).cashEarned) - (Econ.normalize(a.progress).cashEarned),
      meId: this.profile && this.profile.id,
      empty: "No anglers yet — tap Start Fishing!",
    });
    this.showScreen("leaderboard");
  },

  showHelp() { GK.UI.closeModal("modal-settings"); GK.UI.openModal("modal-help"); },

  showStats() {
    GK.UI.closeModal("modal-settings");
    this.el("stat-grid").innerHTML = UI.statsHTML();
    GK.UI.openModal("modal-stats");
  },

  /* ------------------------------------------------------------ fishing callbacks */

  bindFishing() {
    Fishing.getState = () => this.S;
    Fishing.getEvent = () => this.ev;
    Fishing.assist = () => !!this.prefs.easyReel;
    Fishing.canCast = () => !Econ.isFull(this.S) || Econ.mods(this.S, this.ev).autoSell;

    let reelTick = 0, strainTick = 0;
    Fishing.on = {
      cast: () => {
        Sfx.cast();
        this.el("catch-card").hidden = true;
        if (this.S.tut === 0) this.advanceTut(1);
        this.dirty = true;
      },
      splash: () => {
        const b = Scene.lastBobber;
        Sfx.splash();
        if (b && !Scene.reduceMotion) Fx.splash(b.x, b.y, "#e6f7ff", 12);
        if (this.S.ev === undefined && this.ev && this.ev.casts) { /* counted on landing/escape */ }
      },
      bite: () => {
        Sfx.bite();
        const b = Scene.lastBobber;
        if (b) Fx.splash(b.x, b.y, "#ffffff", 16);
        if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* not allowed */ } }
        if (this.S.tut === 1) this.coach("NOW! Tap to hook it! ❗");
      },
      missed: (n) => {
        if (n === 1) GK.UI.toast("Too slow! It's still nibbling… 👀");
        if (this.S.tut <= 1) this.coach("When you see the ❗, TAP straight away!");
      },
      early: () => {
        if (this.clock - this.earlyShown < 1.2) return;
        this.earlyShown = this.clock;
        const b = Scene.lastBobber;
        if (b) Fx.text(b.x, b.y - 20, "wait for it…", { color: "#ffffff", size: 16 });
      },
      blocked: () => {
        Sfx.nope();
        GK.UI.toast("Your haul is full — sell it to keep fishing! 🧺");
        this.openHaul();
      },
      hook: () => {
        Sfx.hook();
        reelTick = 0;
        if (this.S.tut <= 2) { this.advanceTut(2); this.coach(); }
      },
      landed: (fish, out) => this.onLanded(fish, out),
      escaped: (why) => {
        this.countEventCast();
        if (why === "snapped") { Sfx.snap(); GK.UI.toast("Snap! Too tight — let go sooner next time."); }
        else if (why === "slipped") { Sfx.getaway(); GK.UI.toast("It slipped off — hold to keep the line tight."); }
        else { Sfx.getaway(); GK.UI.toast("It swam off. Tap as soon as you see the ❗"); }
        if (!Scene.reduceMotion) Fx.addShake(3);
        this.dirty = true;
      },
    };

    // Reel sounds, driven from the frame rather than the sim.
    this.reelSound = (dt) => {
      if (Fishing.phase !== "reel" || !Fishing.reel) return;
      const r = Fishing.reel;
      reelTick -= dt * (Fishing.holding ? 14 : 5);
      if (reelTick <= 0) { reelTick = 1; Sfx.reelTick(r.p); }
      if (r.side !== 0 && r.strain > 0.45) {
        strainTick -= dt;
        if (strainTick <= 0) { strainTick = 0.28; Sfx.strain(); }
      }
    };
  },

  onLanded(fish, out) {
    const S = this.S, c = CATCH[fish.id], r = RARITY[c.rarity];
    const b = Scene.lastBobber || { x: Scene.W * 0.6, y: Scene.H * 0.5 };
    Scene.launch(c, fish.gold, { x: b.x, y: b.y });
    Fx.splash(b.x, b.y, "#e6f7ff", 22);
    Sfx.catch(r.rank);
    if (r.rank >= 2 || fish.gold) Sfx.rare();
    if (r.rank >= 4) { Sfx.legendary(); if (!Scene.reduceMotion) { Fx.addFlash(0.35, "#fff3b0"); Fx.confetti(Scene.W, Scene.H, ["#ffc93a", "#e8603a", "#4fd08a", "#2f86b4"], 80); } }
    if (out.isNew) setTimeout(() => Sfx.discover(), 350);
    if (out.pbKg || out.pbVal) setTimeout(() => Sfx.personalBest(), 200);

    const token = this.token;
    setTimeout(() => { if (this.token === token && Fishing.phase === "show") this.showCard(fish, out); }, Scene.reduceMotion ? 0 : 420);

    if (out.released) {
      GK.UI.toast(`🐢 Released safely — +${fmtMoney(out.released)} conservation reward!`);
      this.bumpMoney();
    } else if (!out.stored) {
      GK.UI.toast("Your haul is full! Sell it to keep your catches 🧺");
    }

    // competition
    if (this.ev && this.ev.id === "comp" && !c.odd && fish.kg > (this.ev.bestKg || 0)) {
      this.ev.bestKg = fish.kg; this.ev.bestId = c.id;
      Fx.text(Scene.W / 2, Scene.H * 0.3, `🏆 New best: ${fmtKg(fish.kg)}`, { color: "#ffc93a", size: 22 });
    }
    this.countEventCast();
    if (!this.ev) {
      const e = Econ.rollEvent(S, Math.random, this.sinceEvent);
      if (e) this.startEvent(e);
    }

    // tutorial and goals
    if (S.tut <= 3) this.advanceTut(3);
    const ready = Econ.claimable(S);
    if (ready.length) {
      const fresh = ready.find((g) => !this._announced || !this._announced.has(g.id));
      if (fresh) {
        this._announced = this._announced || new Set();
        ready.forEach((g) => this._announced.add(g.id));
        setTimeout(() => GK.UI.toast(`🏅 Goal complete: ${fresh.name}! Collect your reward.`), 900);
      }
    }

    // A full haul with a market van sells itself.
    if (Econ.isFull(S) && Econ.mods(S, this.ev).autoSell) {
      setTimeout(() => { if (this.token === token && Econ.isFull(S)) this.sell(true); }, 700);
    }
    this.coach();
    this.save();
  },

  showCard(fish, out) {
    const c = CATCH[fish.id], r = RARITY[c.rarity];
    const card = this.el("catch-card");
    card.className = `catch-card rar-${c.rarity}`;
    const flags = [];
    if (out.isNew) flags.push(`<span class="flag new">NEW DISCOVERY!</span>`);
    if (fish.gold) flags.push(`<span class="flag gold">✨ GOLDEN ×5</span>`);
    if (out.pbKg) flags.push(`<span class="flag pb">NEW PERSONAL BEST!</span>`);
    else if (out.pbVal) flags.push(`<span class="flag pb">BEST PRICE YET!</span>`);
    if (out.recordKg && this.S.stats.caught > 5 && !out.pbKg) flags.push(`<span class="flag pb">BIGGEST EVER!</span>`);
    this.el("cc-flags").innerHTML = flags.join("");
    const art = this.el("cc-art");
    art.innerHTML = "";
    const spr = Art.sprite(c, 250, fish.gold ? "gold" : "full");
    const cv = document.createElement("canvas");
    cv.width = spr.width; cv.height = spr.height;
    cv.getContext("2d").drawImage(spr, 0, 0);
    art.appendChild(cv);
    this.el("cc-name").textContent = (fish.gold ? "Golden " : "") + c.name;
    this.el("cc-rarity").textContent = `${r.badge} ${r.name}`;
    this.el("cc-kg").textContent = `⚖️ ${fmtKg(fish.kg)}`;
    const price = out.released ? out.released : Math.round(fish.val * Econ.mods(this.S, this.ev).sell);
    this.el("cc-val").textContent = out.released ? `🐢 +${fmtMoney(price)}` : `💰 ${fmtMoney(price)}`;
    this.el("cc-desc").textContent = c.desc;
    card.hidden = false;
  },

  /* ------------------------------------------------------------ events */

  startEvent(def) {
    this.ev = { ...def, left: def.dur || 0, casts: def.casts || 0, bestKg: 0, bestId: "" };
    this.S.stats.events++;
    if (def.id === "comp") this.S.stats.comps++;
    Sfx.eventStart();
    if (def.id === "storm") Sfx.thunder();
    this.stormTimer = 2;
    const banner = this.el("event-banner");
    banner.hidden = false;
    this.el("stage").classList.add("has-event");
    GK.UI.toast(`${def.emoji} ${def.name}! ${def.blurb}`);
    this.eventBanner();
  },

  eventBanner() {
    const ev = this.ev, banner = this.el("event-banner");
    if (!ev) { banner.hidden = true; this.el("stage").classList.remove("has-event"); return; }
    const time = ev.dur ? `${Math.floor(ev.left / 60)}:${String(Math.floor(ev.left % 60)).padStart(2, "0")}` : `${ev.casts} cast${ev.casts === 1 ? "" : "s"} left`;
    let sub = "";
    if (ev.id === "comp") {
      const tg = Econ.compTargets(this.S.loc);
      const medal = Econ.compResult(this.S.loc, ev.bestKg);
      const nextM = [...tg].reverse().find((m) => ev.bestKg < m.kg);
      sub = `Your best: ${ev.bestKg ? fmtKg(ev.bestKg) : "nothing yet"}${medal ? ` ${medal.emoji}` : ""}${nextM ? ` · ${nextM.emoji} at ${fmtKg(nextM.kg)}` : ""}`;
    } else sub = ev.blurb.split("!")[0] + "!";
    this.setHTML(banner, `${ev.emoji} <b>${esc(ev.name)}</b> · ${time}<small>${esc(sub)}</small>`);
  },

  updateEvent(dt) {
    this.reelSound(dt);
    if (Fishing.phase !== "idle") this.sinceEvent += dt;
    const ev = this.ev;
    if (!ev) return;
    if (ev.dur) {
      ev.left -= dt;
      if (ev.left <= 0) this.endEvent();
    }
    if (ev && ev.id === "storm") {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        this.stormTimer = 6 + Math.random() * 7;
        if (!Scene.reduceMotion) Fx.addFlash(0.45, "#ffffff");
        setTimeout(() => Sfx.thunder(), 350);
      }
    }
  },

  countEventCast() {
    if (this.ev && this.ev.casts) {
      this.ev.casts--;
      if (this.ev.casts <= 0) this.endEvent();
    }
  },

  endEvent() {
    const ev = this.ev;
    this.ev = null;
    this.sinceEvent = 0;
    this.eventBanner();
    if (!ev) return;
    if (ev.id === "comp") {
      const medal = Econ.compResult(this.S.loc, ev.bestKg);
      const box = this.el("comp-box");
      if (medal) {
        Econ.earn(this.S, medal.prize, "earnedEvents");
        if (medal.id === "gold") this.S.stats.compWins++;
        Sfx.win();
        box.innerHTML = `<div class="medal">${medal.emoji}</div><h3>${medal.name} medal!</h3>
          <p>Your biggest fish was a ${fmtKg(ev.bestKg)} ${esc(CATCH[ev.bestId].name)}.</p>
          <div class="away-amount">+${fmtMoney(medal.prize)}</div>`;
      } else {
        Sfx.getaway();
        box.innerHTML = `<div class="medal">🎏</div><h3>Competition over</h3>
          <p>${ev.bestKg ? `Your biggest was ${fmtKg(ev.bestKg)} — just short of a medal.` : "No fish landed this time."} There's always the next one!</p>`;
      }
      const ok = document.createElement("button");
      ok.className = "btn sun wide"; ok.textContent = medal ? "💰 Brilliant!" : "Keep fishing";
      ok.onclick = () => { GK.UI.closeModal("modal-comp"); if (medal) this.bumpMoney(); };
      box.appendChild(ok);
      GK.UI.openModal("modal-comp");
      this.save();
    } else {
      GK.UI.toast(`${ev.emoji} ${ev.name} is over.`);
    }
  },

  /* ------------------------------------------------------------ money actions */

  openHaul() {
    UI.renderHaul();
    GK.UI.openModal("modal-haul");
    if (this.S.tut === 3 && this.S.haul.length) this.coach();
  },

  closeHaul() { GK.UI.closeModal("modal-haul"); },

  sell(auto) {
    const S = this.S;
    if (!S.haul.length) return;
    const from = auto ? this.el("nav-haul") : this.el("btn-sell");
    const r = Econ.sell(S, this.ev);
    Sfx.coins(Math.min(14, 4 + r.count));
    this.flyCoins(from, this.el("money-pill"), Math.min(16, 4 + r.count));
    GK.UI.closeModal("modal-haul");
    GK.UI.toast(auto ? `🚚 The market van sold your haul: +${fmtMoney(r.total)}` : `Sold ${r.count} catch${r.count === 1 ? "" : "es"} for ${fmtMoney(r.total)}! 💰`);
    if (S.tut === 3) this.advanceTut(4);
    this.coach();
    this.save(true);
  },

  buy(id) {
    const S = this.S, tr = TRACK[id];
    const r = Econ.buy(S, id);
    if (!r.ok) {
      Sfx.nope();
      if (r.reason === "cash") GK.UI.toast(`${fmtMoney(r.short)} to go — keep fishing! 🎣`);
      else if (r.reason === "locked") GK.UI.toast(`🔒 First you need: ${r.unmet.join(" and ")}`);
      return;
    }
    Sfx.buy();
    const name = tr.bait ? tr.name : ["rod", "reel", "line", "tackle"].includes(tr.cat) ? levelName(tr, r.level) : tr.name;
    const msg = tr.helper ? (r.level === 1 ? `🎉 ${tr.name} has joined the crew!` : `⭐ ${tr.name} is now level ${r.level}!`)
      : tr.boat && r.level === 1 ? `⛵ Your ${tr.name} sets sail!`
      : r.level > 1 && !["rod", "reel", "line", "tackle"].includes(tr.cat) ? `⭐ ${tr.name} upgraded to level ${r.level}!`
      : `🎉 New ${name}!`;
    GK.UI.toast(msg);
    if (S.tut === 4) this.advanceTut(5);
    Scene.bakeKey = "";
    this.save(true);
    if (GK.UI.screen === "shop") UI.renderShop();
    if (GK.UI.screen === "business") UI.renderBusiness();
    this.hud(true);
  },

  useBait(id) {
    if (Econ.selectBait(this.S, id)) {
      Sfx.hook();
      GK.UI.toast(`🪝 ${TRACK[id].name} on the hook.`);
      this.save();
      UI.renderShop();
    }
  },

  unlock(id) {
    const r = Econ.unlock(this.S, id);
    if (!r.ok) {
      Sfx.nope();
      if (r.reason === "cash") GK.UI.toast(`${fmtMoney(r.short)} to go — keep fishing! 🎣`);
      else if (r.reason === "locked") GK.UI.toast(`🔒 First you need: ${r.unmet.join(" and ")}`);
      return;
    }
    Sfx.unlock();
    this.save(true);
    this.arrive(id, true);
  },

  travel(id) {
    if (this.S.loc === id) return this.back();
    if (!Econ.travel(this.S, id)) return;
    Sfx.splash(0.6);
    this.save();
    this.arrive(id, false);
  },

  arrive(id, fresh) {
    const loc = LOCATION[id];
    Fishing.reset();
    this.el("catch-card").hidden = true;
    if (this.ev && this.ev.id === "comp") this.endEvent();
    Music.setLocation(loc);
    Scene.bakeKey = "";
    this.showScreen("game");
    GK.UI.toast(fresh ? `${loc.emoji} Welcome to ${loc.name}! ${CATCHES.filter((c) => c.loc === id).length} new things to discover.` : `${loc.emoji} ${loc.name}`);
    if (fresh && !Scene.reduceMotion) setTimeout(() => Fx.confetti(Scene.W, Scene.H, ["#ffc93a", "#e8603a", "#4fd08a", "#ffffff"], 90), 200);
  },

  claimAll() {
    let cash = 0;
    const baits = [];
    for (const g of Econ.claimable(this.S)) {
      const r = Econ.claim(this.S, g.id);
      if (!r.ok) continue;
      cash += r.cash;
      if (r.bait) baits.push(TRACK[r.bait].name);
    }
    Sfx.claim(); Sfx.coins(8);
    GK.UI.toast(`🎁 +${fmtMoney(cash)}${baits.length ? ` and ${baits.join(", ")}` : ""}!`);
    this.save(true);
    UI.renderGoals();
  },

  claim(id) {
    const r = Econ.claim(this.S, id);
    if (!r.ok) return;
    Sfx.claim();
    GK.UI.toast(r.bait ? `🎁 You got ${TRACK[r.bait].name}! It's on your hook.` : `🎁 +${fmtMoney(r.cash)}!`);
    this.save(true);
    UI.renderGoals();
  },

  /* ------------------------------------------------------------ HUD */

  hud(force) {
    const S = this.S;
    if (!S) return;
    const loc = LOCATION[S.loc];
    this.el("hud-loc-emoji").textContent = loc.emoji;
    this.el("hud-loc").textContent = loc.name;
    const perMin = Econ.perMin(S);
    this.el("hud-rate").textContent = perMin > 0 ? `+${fmtMoney(perMin)}/min` : "";

    const cap = Econ.capacity(S), n = S.haul.length;
    const haul = this.el("nav-haul");
    const val = Econ.haulValue(S, this.ev);
    this.setHTML(this.el("haul-label"), `Haul ${n}/${cap}${n ? `<small>${fmtMoney(val)}</small>` : ""}`);
    haul.classList.toggle("full", n >= cap);
    haul.setAttribute("aria-label", `Haul: ${n} of ${cap}, worth ${fmtMoney(val)}. Tap to sell.`);
    let fill = haul.querySelector(".fill");
    if (!fill) { fill = document.createElement("span"); fill.className = "fill"; fill.innerHTML = "<b></b>"; haul.appendChild(fill); }
    fill.firstChild.style.width = `${Math.min(100, (n / cap) * 100)}%`;

    this.setHTML(this.el("nav-journal-n"), `Journal<small>${Object.keys(S.journal).length}/${CATCHES.length}</small>`);

    // Next target chip
    const tgt = Econ.nextTarget(S);
    const chipT = this.el("chip-target");
    if (tgt) {
      const ready = tgt.gap <= 0;
      chipT.className = "chip" + (ready ? " ready" : "");
      this.setHTML(chipT, `<span class="k">${ready ? "You can afford" : "Saving up for"}</span>${tgt.emoji} ${esc(tgt.name)}${ready ? " — tap!" : ` · ${fmtMoney(tgt.gap)} to go`}<span class="bar-fill" style="width:${Math.round(tgt.frac * 100)}%"></span>`);
    } else this.setHTML(chipT, "");

    // Next goal chip
    const up = Econ.upcoming(S, 1)[0];
    const chipG = this.el("chip-goal");
    if (up) {
      chipG.className = "chip" + (up.done ? " ready" : "");
      const prog = up.need > 1 ? (up.g.unit === "kg" ? ` · ${fmtKg(up.cur)}/${fmtKg(up.need)}` : up.g.unit === "$" || up.g.id.startsWith("earn") ? "" : ` · ${Math.floor(up.cur)}/${up.need}`) : "";
      this.setHTML(chipG, `<span class="k">${up.done ? "Goal complete!" : "Goal"}</span>${up.g.emoji} ${esc(up.done ? up.g.name + " — collect!" : up.g.text)}${prog}<span class="bar-fill" style="width:${Math.round((up.cur / up.need) * 100)}%"></span>`);
    } else this.setHTML(chipG, "");
    this.el("goal-dot").hidden = !Econ.claimable(S).length;

    // Nudge toward the shop once there's money and nothing is bought yet.
    const shopPulse = S.tut === 4 || (S.stats.bought === 0 && S.stats.sales > 0);
    this.el("nav-shop").classList.toggle("pulse", shopPulse);
    this.el("nav-haul").classList.toggle("pulse", S.tut === 3 && n >= Math.min(3, cap) && n < cap);

    if (this.ev) this.eventBanner();
    UI.money();
  },

  castButton() {
    const btn = this.el("btn-cast"), label = this.el("cast-label"), sub = this.el("cast-sub");
    const ph = Fishing.phase;
    let cls = "", l = "CAST", s = "";
    if (ph === "cast") { cls = "wait"; l = "…"; }
    else if (ph === "wait") { cls = "wait"; l = "WAIT…"; s = "for the bobber"; }
    else if (ph === "bite") { cls = "bite"; l = "TAP!"; s = "hook it!"; }
    else if (ph === "reel") { cls = "reel"; l = Fishing.holding ? "REELING" : "HOLD"; s = Fishing.holding ? "let go if too tight" : "to reel in"; }
    else if (ph === "show") { l = "CAST"; s = "one more!"; }
    else if (!Fishing.canCast()) { cls = "blocked"; l = "SELL"; s = "haul is full"; }
    const next = `cast-btn ${cls}${btn.classList.contains("held") ? " held" : ""}`;
    if (btn.className !== next) btn.className = next;
    if (label.textContent !== l) label.textContent = l;
    if (sub.textContent !== s) sub.textContent = s;
    btn.setAttribute("aria-label", `${l} ${s}`.trim());
  },

  animateCash(dt) {
    if (!this.S) return;
    // Hold the counter while the away-earnings are waiting to be collected.
    if (this.el("modal-away").classList.contains("visible")) return;
    const real = Econ.cash(this.S);
    const diff = real - this.shownCash;
    if (Math.abs(diff) < 1) this.shownCash = real;
    else this.shownCash += diff * Math.min(1, dt * 7) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 20);
    const txt = fmtMoney(Math.round(this.shownCash));
    const el = this.el("hud-cash");
    if (el.textContent !== txt) el.textContent = txt;
  },

  bumpMoney() {
    const p = this.el("money-pill");
    p.classList.add("bump");
    setTimeout(() => p.classList.remove("bump"), 180);
  },

  flyCoins(fromEl, toEl, n) {
    const layer = this.el("coin-layer");
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    if (!a.width || !b.width || this.prefs.reduceMotion) { this.bumpMoney(); return; }
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      c.className = "fly-coin"; c.textContent = "🪙";
      const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.6;
      const y0 = a.top + a.height / 2 + (Math.random() - 0.5) * a.height * 0.4;
      c.style.left = `${x0 - 13}px`; c.style.top = `${y0 - 13}px`;
      c.style.transitionDelay = `${i * 0.04}s`;
      layer.appendChild(c);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        c.style.transform = `translate(${b.left + b.width / 2 - x0}px, ${b.top + b.height / 2 - y0}px) scale(0.6)`;
        c.style.opacity = "0.2";
      }));
      setTimeout(() => { c.remove(); if (i === n - 1) this.bumpMoney(); }, 800 + i * 40);
    }
  },

  refreshAll() {
    this.hud(true);
    const sc = GK.UI.screen;
    if (sc === "shop") UI.renderShop();
    if (sc === "business") UI.renderBusiness();
    if (sc === "journal") UI.renderJournal();
    if (sc === "goals") UI.renderGoals();
    if (sc === "map") UI.renderMap();
  },

  /* ------------------------------------------------------------ tutorial */

  advanceTut(step) {
    if (this.S.tut < step) { this.S.tut = step; this.dirty = true; }
  },

  // Phase changes re-evaluate the tutorial bubble, unless a one-off line is still up.
  coachIfIdle() {
    if (this._coachUntil && this.clock < this._coachUntil) return;
    this.coach();
  },

  // Show the coaching bubble for the current step, or a one-off line.
  coach(text) {
    const el = this.el("coach");
    const S = this.S;
    if (!S) { el.hidden = true; return; }
    let msg = text || null;
    if (!msg) {
      if (S.tut === 0 && Fishing.phase === "idle") msg = COACH[0];
      else if (S.tut === 1 && Fishing.phase === "wait") msg = COACH[1];
      else if (S.tut === 2 && Fishing.phase === "reel") msg = COACH[2];
      else if (S.tut === 3 && Fishing.phase === "show" && S.stats.caught <= 1) msg = COACH[3];
      else if (S.tut === 3 && S.haul.length >= 3 && Fishing.phase !== "reel") msg = "Tap your haul 🧺 to sell it!";
      else if (S.tut === 4 && Fishing.phase !== "reel") msg = COACH[4];
    }
    clearTimeout(this._coachTimer);
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    // While reeling the meter sits where the bubble usually does; while a
    // catch card is up the bubble goes above it.
    el.classList.toggle("high", Fishing.phase === "reel");
    el.classList.toggle("top", Fishing.phase === "show");
    el.hidden = false;
    if (text) { this._coachUntil = this.clock + 2.2; this._coachTimer = setTimeout(() => { this._coachUntil = 0; this.coach(); }, 2600); }
  },

  /* ------------------------------------------------------------ settings */

  applyMotion() {
    const reduce = !!this.prefs.reduceMotion || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    Scene.reduceMotion = reduce;
    document.body.classList.toggle("reduce-motion", !!this.prefs.reduceMotion);
  },

  openSettings() {
    this.prefs = Storage.prefs();
    this.el("set-music").value = Math.round(this.prefs.music * 100);
    this.el("set-sfx").value = Math.round(this.prefs.sfx * 100);
    this.paintToggles();
    GK.UI.openModal("modal-settings");
  },

  paintToggles() {
    this.el("set-mute").setAttribute("aria-checked", String(!Sfx.enabled));
    this.el("set-easy").setAttribute("aria-checked", String(!!this.prefs.easyReel));
    this.el("set-motion").setAttribute("aria-checked", String(!!this.prefs.reduceMotion));
  },

  bindSettings() {
    this.el("set-music").addEventListener("input", (e) => {
      Volume.music = e.target.value / 100;
      Storage.setPref("music", Volume.music);
      this.prefs.music = Volume.music;
      if (Volume.music > 0 && this.S) Music.start(); else Music.stop();
    });
    this.el("set-sfx").addEventListener("input", (e) => {
      Volume.sfx = e.target.value / 100;
      Storage.setPref("sfx", Volume.sfx);
      this.prefs.sfx = Volume.sfx;
    });
    this.el("set-sfx").addEventListener("change", () => Sfx.coin());
    this.el("set-mute").onclick = () => {
      Sfx.enabled = !Sfx.enabled;
      Storage.setPref("sound", Sfx.enabled);
      document.querySelectorAll(".btn-sound").forEach((b) => { b.textContent = Sfx.enabled ? "🔊" : "🔇"; });
      this.paintToggles();
      if (Sfx.enabled) Sfx.click();
    };
    this.el("set-easy").onclick = () => {
      this.prefs.easyReel = !this.prefs.easyReel;
      Storage.setPref("easyReel", this.prefs.easyReel);
      this.paintToggles(); Sfx.click();
    };
    this.el("set-motion").onclick = () => {
      this.prefs.reduceMotion = !this.prefs.reduceMotion;
      Storage.setPref("reduceMotion", this.prefs.reduceMotion);
      this.applyMotion(); this.paintToggles(); Sfx.click();
    };
  },

  /* ------------------------------------------------------------ layout */

  // The scene needs to know how much of it the HUD and control bar cover.
  measureInsets() {
    const stage = this.el("stage").getBoundingClientRect();
    const bar = this.el("control-bar").getBoundingClientRect();
    const top = this.el("hud-top").getBoundingClientRect();
    if (stage.height > 50 && bar.height > 20) {
      Scene.bottomInset = Math.max(90, stage.bottom - bar.top + 6);
      Scene.topInset = Math.max(50, top.bottom - stage.top);
    }
  },

  drawSplashArt() {
    const cv = this.el("splash-art");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 280 * dpr; cv.height = 150 * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // water
    const g = ctx.createLinearGradient(0, 96, 0, 150);
    g.addColorStop(0, "rgba(47,134,180,0)"); g.addColorStop(0.3, "rgba(47,134,180,0.55)"); g.addColorStop(1, "rgba(19,75,110,0.8)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(140, 128, 136, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2;
    for (const r of [22, 40, 58]) { ctx.beginPath(); ctx.ellipse(150, 120, r, r * 0.25, 0, 0, Math.PI * 2); ctx.stroke(); }
    // the fish leaping
    ctx.save(); ctx.translate(146, 62); ctx.rotate(-0.35);
    Art.drawCatch(ctx, CATCH.golden_trout, 170);
    ctx.restore();
    // splash drops
    ctx.fillStyle = "#e6f7ff";
    for (const [x, y, r] of [[96, 104, 5], [112, 92, 4], [196, 100, 5], [210, 88, 3.5], [182, 84, 3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  },
};

// Remember the last bobber position so splashes land on it.
{
  const rig = Scene.rig.bind(Scene);
  const bobber = Scene.bobber.bind(Scene);
  Scene.bobber = function (ctx, x, y, u, under) {
    if (Fishing.phase !== "idle") Scene.lastBobber = { x, y };
    return bobber(ctx, x, y, u, under);
  };
  Scene.rig = rig;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
