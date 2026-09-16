// Scene: the fishing view, painted on one canvas every frame.
//
// The expensive, still parts (sky, far scenery, the water's base colour) are
// baked into an offscreen canvas per location and size, then blitted; only
// what moves is drawn live. Everything is laid out from the canvas's own CSS
// size, with a bottom inset so nothing important hides under the control bar.

const Scene = {
  cv: null, ctx: null, W: 360, H: 640, dpr: 1,
  bottomInset: 120, topInset: 70,
  bake: null, bakeKey: "",
  reduceMotion: false,
  flying: null,          // { c, gold, from, t } — a catch arcing out of the water

  init(cv) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
  },

  resize() {
    const box = this.cv.parentElement.getBoundingClientRect();
    if (box.width < 50 || box.height < 50) return false;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.W = box.width; this.H = box.height;
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.bakeKey = "";
    return true;
  },

  // Where everything sits, from the canvas size alone.
  geom() {
    const W = this.W, H = this.H;
    const floor = H - this.bottomInset;
    const portrait = H > W * 1.1;
    const horizon = Math.round(this.topInset + (floor - this.topInset) * (portrait ? 0.24 : 0.2));
    const size = Math.max(84, Math.min(170, Math.min(W * 0.26, (floor - horizon) * 0.42)));
    // Leave room on the bank for the crew when the screen is wide enough.
    const crewRoom = Math.min(this.crew || 0, 3) * size * 0.52;
    const px = Math.max(size * 0.62, Math.min(Math.max(W * 0.2, size * 0.8 + crewRoom), W * 0.36));
    const py = floor - size * 0.08;
    return { W, H, floor, horizon, size, px, py, u: size / 100, portrait };
  },

  /* ------------------------------------------------------------ the baked backdrop */

  backdrop(loc, g) {
    const key = `${loc.id}|${this.W}|${this.H}|${this.dpr}|${this.bottomInset}|${this.topInset}`;
    if (this.bakeKey === key && this.bake) return this.bake;
    const cv = this.bake || document.createElement("canvas");
    cv.width = this.cv.width; cv.height = this.cv.height;
    const ctx = cv.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { W, H, horizon } = g;
    const sc = loc.scene;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, sc.sky[0]); sky.addColorStop(1, sc.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);

    // sun or moon
    if (sc.kind === "deep") {
      for (let i = 0; i < 90; i++) {
        const x = Art.h(i, 7) * W, y = Art.h(i, 9) * horizon * 0.95;
        ctx.fillStyle = `rgba(255,255,240,${0.3 + Art.h(i, 3) * 0.6})`;
        ctx.fillRect(x, y, 1.2 + Art.h(i, 4) * 1.4, 1.2 + Art.h(i, 4) * 1.4);
      }
      Art.ellipse(ctx, W * 0.8, horizon * 0.35, 26, 26); ctx.fillStyle = "#f4f0d8"; ctx.fill();
      Art.ellipse(ctx, W * 0.8 + 9, horizon * 0.35 - 6, 22, 22); ctx.fillStyle = sc.sky[0]; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    } else {
      const sx = W * 0.78, sy = horizon * 0.42;
      const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90);
      sun.addColorStop(0, "rgba(255,248,210,0.95)"); sun.addColorStop(0.25, "rgba(255,236,170,0.55)"); sun.addColorStop(1, "rgba(255,236,170,0)");
      ctx.fillStyle = sun; ctx.fillRect(sx - 90, sy - 90, 180, 180);
      Art.ellipse(ctx, sx, sy, 22, 22); ctx.fillStyle = "#fff4c8"; ctx.fill();
    }

    this.farScenery(ctx, sc, g);

    // water
    const water = ctx.createLinearGradient(0, horizon, 0, H);
    water.addColorStop(0, shade(sc.water[0], 0.18)); water.addColorStop(0.35, sc.water[0]); water.addColorStop(1, sc.water[1]);
    ctx.fillStyle = water; ctx.fillRect(0, horizon, W, H - horizon);
    // the sky's reflection just under the horizon
    const refl = ctx.createLinearGradient(0, horizon, 0, horizon + (H - horizon) * 0.25);
    refl.addColorStop(0, "rgba(255,255,255,0.28)"); refl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = refl; ctx.fillRect(0, horizon, W, (H - horizon) * 0.25);

    this.bake = cv; this.bakeKey = key;
    return cv;
  },

  farScenery(ctx, sc, g) {
    const { W, horizon } = g;
    const hills = (col, amp, base, freq, seed) => {
      ctx.beginPath(); ctx.moveTo(0, horizon);
      for (let x = 0; x <= W + 10; x += 10) {
        const y = horizon - base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed)) - amp * 0.4 * Math.sin(x * freq * 2.7 + seed * 2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, horizon); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    const tree = (x, y, r, col) => {
      ctx.fillStyle = shade(col, -0.35); ctx.fillRect(x - r * 0.12, y - r * 0.4, r * 0.24, r * 0.6);
      Art.ellipse(ctx, x, y - r * 0.8, r * 0.7, r * 0.75); ctx.fillStyle = col; ctx.fill();
      Art.ellipse(ctx, x - r * 0.2, y - r * 1.0, r * 0.3, r * 0.25); ctx.fillStyle = shade(col, 0.15); ctx.fill();
    };
    const pine = (x, y, h, col) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(x, y - h + i * h * 0.22);
        ctx.lineTo(x - h * (0.22 + i * 0.07), y - h * 0.35 + i * h * 0.22); ctx.lineTo(x + h * (0.22 + i * 0.07), y - h * 0.35 + i * h * 0.22); ctx.fill();
      }
    };
    switch (sc.kind) {
      case "pond":
        hills(shade(sc.far, 0.12), 22, 14, 0.008, 1);
        hills(sc.far, 16, 4, 0.013, 3);
        for (let i = 0; i < 14; i++) tree(Art.h(i, 5) * W, horizon - 2, 14 + Art.h(i, 6) * 14, i % 3 ? sc.near : shade(sc.near, 0.1));
        break;
      case "river":
        hills(shade(sc.far, 0.25), 40, 26, 0.006, 2);
        hills(sc.far, 18, 6, 0.011, 5);
        for (let i = 0; i < 10; i++) tree(Art.h(i, 11) * W, horizon - 2, 12 + Art.h(i, 12) * 12, sc.near);
        // a stone bridge far away, arches over its own reflection
        ctx.fillStyle = "#a89a88";
        ctx.fillRect(W * 0.3, horizon - 16, W * 0.12, 7);
        ctx.fillStyle = sc.water[0];
        for (let i = 0; i < 3; i++) { Art.ellipse(ctx, W * (0.315 + i * 0.045), horizon, W * 0.017, 9); ctx.fill(); }
        ctx.fillStyle = "#a89a88";
        for (let i = 0; i < 4; i++) ctx.fillRect(W * (0.3 + i * 0.043), horizon - 10, 5, 10);
        break;
      case "lake": {
        const peaks = [[0.1, 0.7], [0.3, 1], [0.55, 0.8], [0.8, 1.1], [1.0, 0.6]];
        for (const [fx, fh] of peaks) {
          const x = fx * W, h = (horizon - 40) * 0.55 * fh + 30;
          ctx.beginPath(); ctx.moveTo(x - h * 1.1, horizon); ctx.lineTo(x, horizon - h); ctx.lineTo(x + h * 1.1, horizon); ctx.closePath();
          ctx.fillStyle = sc.far; ctx.fill();
          ctx.beginPath(); ctx.moveTo(x, horizon - h); ctx.lineTo(x - h * 0.28, horizon - h * 0.72); ctx.lineTo(x - h * 0.08, horizon - h * 0.78);
          ctx.lineTo(x + h * 0.06, horizon - h * 0.7); ctx.lineTo(x + h * 0.28, horizon - h * 0.74); ctx.closePath();
          ctx.fillStyle = "#f4f6fa"; ctx.fill();
        }
        hills(shade(sc.near, 0.1), 10, 2, 0.02, 4);
        for (let i = 0; i < 26; i++) pine(Art.h(i, 21) * W, horizon + 1, 16 + Art.h(i, 22) * 16, shade(sc.near, -0.1 + Art.h(i, 23) * 0.15));
        break;
      }
      case "pier": {
        hills("#e6d2a8", 8, 2, 0.02, 1);
        const cols = ["#e86a5a", "#f2c04a", "#6ab0e0", "#f4f0e6", "#8ac07a", "#e89ac0"];
        for (let i = 0; i < 16; i++) {
          const x = W * 0.28 + i * Math.max(18, W * 0.04), w = 16 + Art.h(i, 31) * 10, h = 16 + Art.h(i, 32) * 22;
          if (x > W * 0.92) break;
          ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, horizon - h, w, h);
          ctx.beginPath(); ctx.moveTo(x - 2, horizon - h); ctx.lineTo(x + w / 2, horizon - h - 9); ctx.lineTo(x + w + 2, horizon - h); ctx.fillStyle = "#9a4a3a"; ctx.fill();
          ctx.fillStyle = "rgba(60,80,110,0.55)"; ctx.fillRect(x + 4, horizon - h + 6, 5, 5);
        }
        // lighthouse
        const lx = W * 0.94, lh = Math.min(90, horizon * 0.6);
        ctx.fillStyle = "#f4f0e6"; ctx.beginPath(); ctx.moveTo(lx - 9, horizon); ctx.lineTo(lx - 6, horizon - lh); ctx.lineTo(lx + 6, horizon - lh); ctx.lineTo(lx + 9, horizon); ctx.fill();
        ctx.fillStyle = "#d8342a"; for (let i = 0; i < 3; i++) ctx.fillRect(lx - 8 + i, horizon - lh * (0.3 + i * 0.25), 16 - i * 2, lh * 0.1);
        ctx.fillStyle = "#f2c032"; ctx.fillRect(lx - 5, horizon - lh - 9, 10, 9);
        break;
      }
      case "open":
        // a far island with one palm
        Art.ellipse(ctx, W * 0.72, horizon + 2, 60, 12); ctx.fillStyle = "#e8d6a0"; ctx.fill();
        Art.ellipse(ctx, W * 0.72, horizon, 34, 14); ctx.fillStyle = "#6aa65a"; ctx.fill();
        ctx.strokeStyle = "#7a5a3a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W * 0.73, horizon - 6); ctx.quadraticCurveTo(W * 0.74, horizon - 30, W * 0.72, horizon - 44); ctx.stroke();
        ctx.fillStyle = "#4e8a44";
        for (let i = 0; i < 5; i++) { Art.ellipse(ctx, W * 0.72 + Math.cos(i * 1.26) * 12, horizon - 46 + Math.sin(i * 1.26) * 5, 14, 4, i * 1.26); ctx.fill(); }
        break;
      case "deep":
        hills("#141c40", 6, 0, 0.01, 1);
        break;
    }
  },

  /* ------------------------------------------------------------ per-frame */

  draw(t, S, ev, fish) {
    const ctx = this.ctx;
    const kind0 = LOCATION[S.loc].scene.kind;
    this.crew = kind0 === "open" || kind0 === "deep" ? 0
      : TRACKS.filter((tr) => tr.helper && tr.id !== "kofi" && Econ.own(S, tr.id) > 0).length;
    const g = this.geom();
    const loc = LOCATION[S.loc];
    const { W, H, horizon } = g;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop(loc, g), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const [shx, shy] = Fx.shakeOffset();
    ctx.save();
    ctx.translate(shx, shy);

    this.clouds(ctx, g, t, loc);
    this.water(ctx, g, t, loc);
    this.fleet(ctx, g, t, S);
    if (ev && ev.id === "shadow") this.shadow(ctx, g, t);
    if (ev && ev.id === "ripple") this.swirl(ctx, g, t, fish);
    this.foreground(ctx, g, t, S, loc);
    this.rig(ctx, g, t, S, fish);
    this.flyingCatch(ctx, g);
    Fx.render(ctx);
    this.weather(ctx, g, t, ev);
    ctx.restore();

    if (fish.phase === "reel" && fish.reel) this.meter(ctx, g, fish.reel, t);
    if (Fx.flash > 0.01) {
      ctx.fillStyle = Fx.flashColor; ctx.globalAlpha = Math.min(1, Fx.flash); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  },

  clouds(ctx, g, t, loc) {
    if (loc.scene.kind === "deep") return;
    const { W, horizon } = g;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 5; i++) {
      const speed = 4 + Art.h(i, 41) * 6;
      const x = ((Art.h(i, 42) * (W + 240) + t * speed) % (W + 240)) - 120;
      const y = horizon * (0.12 + Art.h(i, 43) * 0.45);
      const s = 0.7 + Art.h(i, 44) * 0.8;
      for (const [dx, dy, r] of [[0, 0, 18], [18, -8, 22], [40, 0, 17], [20, 6, 20]]) {
        Art.ellipse(ctx, x + dx * s, y + dy * s, r * s * 1.3, r * s); ctx.fill();
      }
    }
  },

  water(ctx, g, t, loc) {
    const { W, H, horizon } = g;
    const kind = loc.scene.kind;
    const flow = kind === "river" ? 26 : 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const depth = Math.pow((i + 0.5) / 34, 1.5);
      const y = horizon + 4 + depth * (H - horizon);
      const x = ((Art.h(i, 51) * W + t * (flow * (0.4 + depth) + 3 * Math.sin(t * 0.5 + i))) % (W + 60)) - 30;
      const len = 8 + depth * 40;
      ctx.strokeStyle = kind === "deep" ? `rgba(140,200,255,${0.1 + depth * 0.12})` : `rgba(255,255,255,${0.16 + depth * 0.18})`;
      ctx.lineWidth = 1 + depth * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
    if (kind === "deep") {
      for (let i = 0; i < 16; i++) {
        const x = Art.h(i, 61) * W, y = horizon + 20 + Art.h(i, 62) * (H - horizon - 40);
        const a = 0.25 + 0.35 * Math.sin(t * (0.8 + Art.h(i, 63)) + i);
        if (a <= 0) continue;
        ctx.fillStyle = `rgba(120,255,230,${a})`; Art.ellipse(ctx, x, y, 2.2, 2.2); ctx.fill();
      }
    }
    if (kind === "pond") {
      // lily pads
      for (let i = 0; i < 6; i++) {
        const x = W * (0.42 + Art.h(i, 71) * 0.55), y = horizon + (H - horizon) * (0.12 + Art.h(i, 72) * 0.5);
        const r = 10 + Art.h(i, 73) * 12 + (y - horizon) * 0.03;
        const bob = Math.sin(t * 0.8 + i) * 1.2;
        ctx.beginPath(); ctx.ellipse(x, y + bob, r, r * 0.42, 0, 0.3, Math.PI * 2 - 0.1); ctx.lineTo(x, y + bob); ctx.closePath();
        ctx.fillStyle = "#4f9a4a"; ctx.fill(); ctx.strokeStyle = "#2f6a2e"; ctx.lineWidth = 1.2; ctx.stroke();
        if (i % 3 === 0) { Art.ellipse(ctx, x - r * 0.2, y + bob - r * 0.25, r * 0.28, r * 0.22); ctx.fillStyle = "#f7b6cf"; ctx.fill(); }
      }
    }
  },

  // Every boat the business owns sails past in the distance.
  fleet(ctx, g, t, S) {
    const { W, horizon } = g;
    // A trawler on a lily pond would look silly: inland, only the little boat comes along.
    const inland = ["pond", "river", "lake"].includes(LOCATION[S.loc].scene.kind);
    const boats = (inland ? ["smallboat"] : ["smallboat", "fishingboat", "charter", "trawler", "vessel"]).filter((id) => Econ.own(S, id) > 0);
    boats.forEach((id, i) => {
      const lane = i;
      const size = 34 + lane * 7;
      const speed = 7 + Art.h(i, 81) * 5;
      const span = W + size * 3;
      const x = ((Art.h(i, 82) * span + t * speed) % span) - size * 1.5;
      const y = horizon + 10 + lane * 9 + Math.sin(t * 1.3 + i) * 1.2;
      ctx.save(); ctx.translate(x, y);
      Art.boat(ctx, id, size, t);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x - size * 0.5, y + 2, size * 1.05, 1.5);
    });
  },

  foreground(ctx, g, t, S, loc) {
    const { W, H, floor, px, py, u, size } = g;
    const kind = loc.scene.kind;
    const helpers = TRACKS.filter((tr) => tr.helper && Econ.own(S, tr.id) > 0).map((tr) => tr.id);

    if (kind === "pond" || kind === "river" || kind === "lake") {
      const edge = px + size * 0.62;
      const grass = kind === "lake" ? "#6a8a5a" : loc.scene.near;
      ctx.beginPath();
      ctx.moveTo(-10, py - 6);
      ctx.bezierCurveTo(edge * 0.5, py - 16, edge * 0.9, py - 10, edge, py - 2);
      ctx.quadraticCurveTo(edge + 36, py + 18, edge + 70, H);
      ctx.lineTo(-10, H); ctx.closePath();
      ctx.fillStyle = loc.scene.ground; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-10, py - 6);
      ctx.bezierCurveTo(edge * 0.5, py - 16, edge * 0.9, py - 10, edge, py - 2);
      ctx.lineTo(edge - 6, py + 8); ctx.bezierCurveTo(edge * 0.6, py + 2, edge * 0.3, py + 4, -10, py + 6);
      ctx.closePath(); ctx.fillStyle = grass; ctx.fill();
      ctx.strokeStyle = shade(grass, -0.2); ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = Art.h(i, 91) * edge, y = py - 8 + Art.h(i, 92) * 6;
        const sway = Math.sin(t * 1.4 + i) * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1, y - 7, x + 3 + sway, y - 12); ctx.stroke();
      }
      // reeds at the water's edge
      ctx.strokeStyle = "#5a8a3a"; ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) {
        const x = edge + 8 + i * 8, sway = Math.sin(t * 1.1 + i * 0.7) * 3;
        ctx.beginPath(); ctx.moveTo(x, py + 18); ctx.quadraticCurveTo(x + 2, py - 10, x + sway, py - 30 - i * 3); ctx.stroke();
        if (i % 2 === 0) { Art.ellipse(ctx, x + sway, py - 28 - i * 3, 2.6, 7); ctx.fillStyle = "#7a4a2a"; ctx.fill(); }
      }
      if (kind === "lake") { ctx.fillStyle = "#8a8f96"; Art.ellipse(ctx, edge * 0.2, py - 2, 18, 9); ctx.fill(); }
      this.bucket(ctx, px - size * 0.42, py - 4, u, S);
      this.helpers(ctx, g, t, helpers.filter((h) => h !== "kofi"), (i) => ({ x: px - size * (0.95 + i * 0.52), y: py - 4, sit: true }));
      this.player(ctx, g, px, py, false);
    } else if (kind === "pier") {
      const end = px + size * 0.55, deck = py;
      ctx.fillStyle = "#6b4a2e";
      for (let x = 12; x < end; x += size * 0.5) ctx.fillRect(x, deck, 8, H - deck);
      ctx.fillStyle = "#a57a4e"; ctx.fillRect(-10, deck - 2, end + 10, 14);
      ctx.strokeStyle = "#7a5634"; ctx.lineWidth = 1.2;
      for (let x = 0; x < end; x += 16) { ctx.beginPath(); ctx.moveTo(x, deck - 2); ctx.lineTo(x, deck + 12); ctx.stroke(); }
      ctx.fillStyle = "#8a6038"; ctx.fillRect(end - 6, deck - 40 * u, 6, 40 * u);
      ctx.fillRect(-10, deck - 36 * u, end, 4);
      this.bucket(ctx, px - size * 0.4, deck - 2, u, S);
      this.helpers(ctx, g, t, helpers.filter((h) => h !== "kofi"), (i) => ({ x: px - size * (0.9 + i * 0.45), y: deck - 2, sit: false }));
      // a seagull on the post
      this.gull(ctx, end - 3, deck - 40 * u, u, t);
      this.player(ctx, g, px, py, false);
    } else {
      // Afloat: the player's own boat under them, deck at the player's feet.
      const bob = this.bob(t, kind);
      const boatId = kind === "deep" ? "workboat" : "dinghy";
      const bsize = size * (kind === "deep" ? 1.9 : 1.7);
      const bu = bsize / 100;
      const hullH = boatId === "workboat" ? 20 : 13;
      const deckY = py + bob;
      ctx.save();
      ctx.translate(px - bsize * (kind === "deep" ? -0.02 : 0.12), deckY + (hullH + 2) * bu);
      Art.boat(ctx, boatId, bsize, t);
      ctx.restore();
      if (Econ.own(S, "kofi")) {
        ctx.save(); ctx.translate(px - size * (kind === "deep" ? 0.5 : 0.62), deckY);
        Art.person(ctx, "kofi", size * 0.78, { hand: { x: 14, y: -44 } });
        ctx.restore();
      }
      this.player(ctx, g, px, deckY, false);
      // waterline foam
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 6; i++) {
        const x = px - bsize * 0.45 + i * bsize * 0.2 + Math.sin(t * 2 + i) * 3;
        Art.ellipse(ctx, x, deckY + (hullH + 8) * bu, 10, 3); ctx.fill();
      }
    }
  },

  bob(t, kind) { return kind === "open" || kind === "deep" ? Math.sin(t * 1.6) * 2.2 : 0; },

  player(ctx, g, x, y, sit) {
    ctx.save(); ctx.translate(x, y);
    Art.person(ctx, "you", g.size, { hand: { x: 20 * g.u, y: -56 * g.u }, sit });
    ctx.restore();
  },

  helpers(ctx, g, t, ids, place) {
    ids.slice(0, 4).forEach((id, i) => {
      const p = place(i);
      if (p.x < 10) return;
      ctx.save(); ctx.translate(p.x, p.y);
      const s = g.size * 0.72;
      Art.person(ctx, id, s, { sit: p.sit, hand: { x: 16 * s / 100, y: (p.sit ? -48 : -56) * s / 100 } });
      if (id === "sam") {
        ctx.strokeStyle = "#8a5a32"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(16 * s / 100, -48 * s / 100); ctx.lineTo(70 * s / 100, -100 * s / 100); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(70 * s / 100, -100 * s / 100); ctx.lineTo(80 * s / 100 + Math.sin(t) * 2, 30); ctx.stroke();
      }
      ctx.restore();
    });
  },

  gull(ctx, x, y, u, t) {
    ctx.save(); ctx.translate(x, y);
    const s = u * 0.9;
    Art.ellipse(ctx, 0, -7 * s, 9 * s, 6 * s); ctx.fillStyle = "#fbfbf7"; ctx.fill();
    Art.ellipse(ctx, 7 * s, -13 * s, 5 * s, 4.5 * s); ctx.fill();
    ctx.fillStyle = "#8a9aa6"; Art.ellipse(ctx, -2 * s, -8 * s, 7 * s, 3.5 * s, -0.2); ctx.fill();
    ctx.fillStyle = "#f2a030"; ctx.beginPath(); ctx.moveTo(11 * s, -13 * s); ctx.lineTo(16 * s, -12 * s); ctx.lineTo(11 * s, -11 * s); ctx.fill();
    ctx.fillStyle = "#222"; Art.ellipse(ctx, 8 * s, -14 * s, 1 * s, 1 * s); ctx.fill();
    if (Math.sin(t * 0.7) > 0.96) { ctx.fillStyle = "#222"; ctx.font = `${10 * s}px sans-serif`; ctx.fillText("♪", 14 * s, -20 * s); }
    ctx.restore();
  },

  // A bucket that fills up as the haul does.
  bucket(ctx, x, y, u, S) {
    const cap = Econ.capacity(S), n = S.haul.length;
    ctx.save(); ctx.translate(x, y);
    const w = 22 * u, h = 20 * u;
    const f = Math.min(1, n / Math.max(1, cap));
    if (f > 0) {
      for (let i = 0; i < Math.min(5, Math.ceil(f * 5)); i++) {
        ctx.save(); ctx.translate((-6 + i * 3) * u, -h - 2 * u); ctx.rotate(-0.6 + i * 0.3);
        ctx.fillStyle = ["#8fa7b3", "#e0a526", "#7c9a3c", "#e0675e", "#4f7ea1"][i];
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3 * u, -8 * u); ctx.lineTo(3 * u, -8 * u); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.lineTo(w / 2, -h); ctx.lineTo(w * 0.4, 0); ctx.lineTo(-w * 0.4, 0); ctx.closePath();
    ctx.fillStyle = f >= 1 ? "#d8342a" : "#5a8ac0"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = "#c8ccd4"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -h, w * 0.45, Math.PI, 0); ctx.stroke();
    ctx.restore();
  },

  // Rod angle for the current moment of the cast, in radians (0 = right).
  rodAngle(fish, t) {
    const up = -1.05;
    switch (fish.phase) {
      case "cast": {
        const k = fish.t / CAST_TIME;
        if (k < 0.35) return up - (k / 0.35) * 0.95;
        if (k < 0.62) return up - 0.95 + ((k - 0.35) / 0.27) * 1.5;
        return -0.62;
      }
      case "wait": return -0.66 + Math.sin(t * 1.2) * 0.02;
      case "bite": return -0.56 + Math.sin(t * 30) * 0.03;
      case "reel": return -0.88 - (fish.reel ? fish.reel.p * 0.25 : 0);
      case "show": return -1.2 + Math.min(1, fish.t * 3) * 0.1;
      default: return up + Math.sin(t * 0.9) * 0.02;
    }
  },

  // The rod, the line and the bobber.
  rig(ctx, g, t, S, fish) {
    const loc = LOCATION[S.loc];
    const hx = g.px + 20 * g.u, hy = g.py - 56 * g.u + this.bob(t, loc.scene.kind);
    const look = TRACK.rod.levels[Econ.own(S, "rod") - 1].look;
    const len = g.size * 1.25 * look.len;
    const ang = this.rodAngle(fish, t);
    const tension = fish.phase === "reel" && fish.reel ? 0.3 + fish.reel.p * 0.6 : fish.phase === "bite" ? 0.25 : 0.05;
    const tipX = hx + Math.cos(ang) * len, tipY = hy + Math.sin(ang) * len + tension * len * 0.18;

    // bobber position
    const water = { x0: g.px + g.size, x1: g.W - 24, y0: g.horizon + 20, y1: g.floor - 40 };
    const target = { x: water.x0 + (water.x1 - water.x0) * fish.target.x, y: water.y0 + (water.y1 - water.y0) * fish.target.y };
    let bx = null, by = null, under = 0;
    if (fish.phase === "cast") {
      const k = fish.t / CAST_TIME;
      if (k > 0.45) {
        const f = (k - 0.45) / 0.55;
        bx = tipX + (target.x - tipX) * f;
        by = tipY + (target.y - tipY) * f - Math.sin(f * Math.PI) * (g.H * 0.18);
      }
    } else if (fish.phase === "wait") {
      bx = target.x; by = target.y + Math.sin(t * 2.4) * 1.5;
      // an interested fish: tiny twitches just before the bite
      if (fish.waitFor - fish.t < 0.6) bx += Math.sin(t * 40) * 1.2;
    } else if (fish.phase === "bite") {
      bx = target.x + Math.sin(t * 38) * 2.5; by = target.y + 5; under = 1;
    } else if (fish.phase === "reel" && fish.reel) {
      const r = fish.reel;
      const k = r.prog;
      bx = target.x + (hx + g.size * 0.8 - target.x) * k + (r.p - r.c) * 60;
      by = target.y + (g.floor - 30 - target.y) * k * 0.6 + Math.sin(t * 9) * 2;
      under = 0.6;
    }

    // rod
    const bend = tension * 0.35;
    const midX = hx + Math.cos(ang) * len * 0.55 + Math.cos(ang + Math.PI / 2) * len * bend * 0.3;
    const midY = hy + Math.sin(ang) * len * 0.55 + Math.sin(ang + Math.PI / 2) * len * bend * 0.3;
    ctx.lineCap = "round";
    ctx.strokeStyle = shade(look.c, -0.4); ctx.lineWidth = 6 * (look.thick || 1) * g.u + 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
    ctx.strokeStyle = look.c; ctx.lineWidth = 4 * (look.thick || 1) * g.u;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
    ctx.strokeStyle = look.tip; ctx.lineWidth = 2.2 * g.u;
    ctx.beginPath(); ctx.moveTo(midX + (tipX - midX) * 0.6, midY + (tipY - midY) * 0.6); ctx.lineTo(tipX, tipY); ctx.stroke();
    if (look.shine) Art.star(ctx, midX, midY, 5 + Math.sin(t * 3) * 1.5, "#fffbe0");
    // reel on the handle
    Art.ellipse(ctx, hx + Math.cos(ang) * 10 * g.u, hy + Math.sin(ang) * 10 * g.u + 6 * g.u, 6 * g.u, 6 * g.u);
    ctx.fillStyle = "#c9ccd2"; ctx.fill(); ctx.strokeStyle = "#6a6f78"; ctx.lineWidth = 1.5; ctx.stroke();

    if (bx === null) {
      // idle: a little lure dangling from the tip
      const sway = Math.sin(t * 1.8) * 4;
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + sway, tipY + 22 * g.u); ctx.stroke();
      this.bobber(ctx, tipX + sway, tipY + 26 * g.u, g.u, 0);
      return;
    }
    // line
    const sag = fish.phase === "reel" ? 4 : fish.phase === "bite" ? 10 : 40;
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + sag, bx, by); ctx.stroke();

    if (fish.phase !== "cast") this.ripples(ctx, bx, by + 3, t, fish.phase === "bite" ? 2 : 1);
    this.bobber(ctx, bx, by, g.u, under);

    if (fish.phase === "bite") {
      const pulse = 1 + Math.sin(t * 16) * 0.12;
      ctx.save(); ctx.translate(bx, by - 42 * g.u); ctx.scale(pulse, pulse);
      Art.ellipse(ctx, 0, 0, 18, 18); ctx.fillStyle = "#ffdf3a"; ctx.fill();
      ctx.strokeStyle = "#8a5a00"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#3a2400"; ctx.font = "900 24px 'Baloo 2', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("!", 0, 2);
      ctx.restore();
    }
    if (fish.phase === "reel") {
      // spray where the fish is thrashing
      if (Math.random() < 0.3 && !this.reduceMotion) Fx.splash(bx + (Math.random() - 0.5) * 16, by + 2, "#dff4ff", 1);
    }
  },

  bobber(ctx, x, y, u, under) {
    const r = Math.max(5, 7 * u);
    ctx.save(); ctx.translate(x, y + under * r * 0.9);
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = "#e8392e"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = "#fbfbf5"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.strokeStyle = "#5a1a14"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#3a3a3a"; ctx.fillRect(-1, -r - 5, 2, 5);
    ctx.restore();
  },

  ripples(ctx, x, y, t, strength) {
    for (let i = 0; i < 3; i++) {
      const k = ((t * (0.6 + strength * 0.5) + i / 3) % 1);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.5})`;
      ctx.lineWidth = 1.4;
      Art.ellipse(ctx, x, y, 6 + k * 26 * strength, (6 + k * 26 * strength) * 0.32);
      ctx.stroke();
    }
  },

  // Begin a catch's leap out of the water toward the player.
  launch(c, gold, from) {
    this.flying = { c, gold, from, t: 0 };
  },

  flyingCatch(ctx, g) {
    const f = this.flying;
    if (!f) return;
    const dur = 0.6;
    const k = Math.min(1, f.t / dur);
    const to = { x: g.px + g.size * 0.75, y: g.py - g.size * 1.25 };
    const x = f.from.x + (to.x - f.from.x) * k;
    const y = f.from.y + (to.y - f.from.y) * k - Math.sin(k * Math.PI) * g.size * 0.9;
    const w = g.size * (0.55 + 0.25 * k);
    const spr = Art.sprite(f.c, 120, f.gold ? "gold" : "full");
    ctx.save(); ctx.translate(x, y); ctx.rotate((1 - k) * -0.9 + Math.sin(f.t * 20) * 0.08 * (1 - k));
    ctx.globalAlpha = k >= 1 ? Math.max(0, 1 - (f.t - dur) * 3) : 1;
    ctx.drawImage(spr, -w / 2, -w * 0.33, w, w * 0.66);
    ctx.restore();
    if (f.t > dur + 0.34) this.flying = null;
  },

  // The Huge Shadow event: something vast drifting below.
  shadow(ctx, g, t) {
    const x = g.W * 0.62 + Math.sin(t * 0.3) * g.W * 0.18, y = g.horizon + (g.floor - g.horizon) * 0.5;
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(t * 0.3) > 0 ? -1 : 1, 1);
    ctx.globalAlpha = 0.28; ctx.fillStyle = "#061228";
    Art.ellipse(ctx, 0, 0, 110, 34); ctx.fill();
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(160, -36); ctx.lineTo(150, 0); ctx.lineTo(160, 36); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  swirl(ctx, g, t) {
    const x = g.px + g.size + (g.W - 24 - g.px - g.size) * 0.66, y = g.horizon + 20 + (g.floor - 60 - g.horizon) * 0.46;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.34);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(t * 0.6 + i);
      ctx.strokeStyle = `rgba(180,140,255,${0.35 - i * 0.07})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 30 + i * 22, 0, Math.PI * 1.3); ctx.stroke();
    }
    ctx.restore();
  },

  weather(ctx, g, t, ev) {
    if (!ev) return;
    const { W, H } = g;
    if (ev.id === "storm") {
      ctx.fillStyle = "rgba(24,34,56,0.3)"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(210,225,255,0.45)"; ctx.lineWidth = 1.2;
      const n = this.reduceMotion ? 30 : 90;
      for (let i = 0; i < n; i++) {
        const x = (Art.h(i, 101) * (W + 100) + t * 60) % (W + 100) - 50;
        const y = (Art.h(i, 102) * H + t * (520 + Art.h(i, 103) * 200)) % H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
      }
    } else if (ev.id === "golden") {
      ctx.fillStyle = "rgba(255,190,60,0.14)"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 24; i++) {
        const x = Art.h(i, 111) * W, y = g.horizon + ((Art.h(i, 112) * (H - g.horizon) - t * 18 * (0.5 + Art.h(i, 113))) % (H - g.horizon) + (H - g.horizon)) % (H - g.horizon);
        Art.star(ctx, x, y, 2 + Art.h(i, 114) * 3, `rgba(255,236,150,${0.5 + 0.4 * Math.sin(t * 3 + i)})`);
      }
    } else if (ev.id === "lucky") {
      for (let i = 0; i < 12; i++) {
        const x = (Art.h(i, 121) * W + t * 14) % W, y = (Art.h(i, 122) * g.horizon + Math.sin(t + i) * 10);
        ctx.fillStyle = "rgba(90,200,110,0.7)"; ctx.font = "14px sans-serif"; ctx.fillText("🍀", x, y);
      }
    } else if (ev.id === "comp") {
      // bunting across the top
      const cols = ["#e8392e", "#f2c032", "#2f9ae0", "#3aa05a"];
      ctx.strokeStyle = "rgba(60,40,20,0.6)"; ctx.lineWidth = 1.5;
      const y0 = this.topInset + 6;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(W / 2, y0 + 24, W, y0); ctx.stroke();
      for (let i = 0; i < Math.ceil(W / 34); i++) {
        const x = i * 34 + 10, k = x / W, y = y0 + 4 * 24 * k * (1 - k);
        ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 16); ctx.closePath();
        ctx.fillStyle = cols[i % 4]; ctx.fill();
      }
    }
  },

  // The tension meter, drawn above the control bar while reeling.
  meter(ctx, g, r, t) {
    const w = Math.min(g.W - 40, 560), h = 30;
    const x = (g.W - w) / 2, y = g.floor - 78;
    ctx.save();
    // panel
    ctx.fillStyle = "rgba(14,30,48,0.78)";
    ctx.beginPath(); ctx.roundRect(x - 12, y - 30, w + 24, h + 58, 16); ctx.fill();
    // track
    const trk = ctx.createLinearGradient(x, 0, x + w, 0);
    trk.addColorStop(0, "#5a7a9a"); trk.addColorStop(0.5, "#3a5068"); trk.addColorStop(1, "#9a4a4a");
    ctx.fillStyle = trk; ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
    // safe zone, striped so it doesn't rely on colour alone
    const zx = x + w * (r.c - r.zone / 2), zw = w * r.zone;
    ctx.fillStyle = "#4fd08a"; ctx.beginPath(); ctx.roundRect(zx, y + 2, zw, h - 4, 9); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(zx, y + 2, zw, h - 4, 9); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 5;
    for (let i = -h; i < zw + h; i += 12) { ctx.beginPath(); ctx.moveTo(zx + i, y + h); ctx.lineTo(zx + i + h, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "#e8fff0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(zx, y + 2, zw, h - 4, 9); ctx.stroke();
    // marker
    const mx = x + w * r.p;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0e1e30"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mx, y - 4); ctx.lineTo(mx - 9, y - 16); ctx.lineTo(mx + 9, y - 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(mx - 3.5, y - 4, 7, h + 8, 3); ctx.fill(); ctx.stroke();

    // labels
    ctx.font = "800 12px 'Baloo 2', sans-serif"; ctx.textBaseline = "middle";
    ctx.textAlign = "left"; ctx.fillStyle = r.side < 0 ? "#ffd166" : "rgba(255,255,255,0.6)";
    ctx.fillText(r.side < 0 ? "◀ TOO LOOSE — HOLD!" : "◀ loose", x + 4, y - 18);
    ctx.textAlign = "right"; ctx.fillStyle = r.side > 0 ? "#ff8a7a" : "rgba(255,255,255,0.6)";
    ctx.fillText(r.side > 0 ? "TOO TIGHT — LET GO! ▶" : "tight ▶", x + w - 4, y - 18);

    // landing progress and strain, as two labelled bars
    const by = y + h + 10, bw = w / 2 - 8;
    ctx.textAlign = "left"; ctx.fillStyle = "#e8fff0"; ctx.font = "800 11px 'Baloo 2', sans-serif";
    ctx.fillText("🐟 LANDING", x, by + 5);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x + 76, by, bw - 76, 10);
    ctx.fillStyle = "#4fd08a"; ctx.fillRect(x + 76, by, (bw - 76) * r.prog, 10);
    ctx.fillStyle = "#ffe0d8"; ctx.fillText("⚠ STRAIN", x + w / 2 + 8, by + 5);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x + w / 2 + 76, by, bw - 76, 10);
    const hot = r.strain > 0.6 && Math.sin(t * 20) > 0;
    ctx.fillStyle = hot ? "#ffd166" : "#ff6a5a"; ctx.fillRect(x + w / 2 + 76, by, (bw - 76) * r.strain, 10);
    ctx.restore();
  },

  /* ------------------------------------------------------------ the harbour (Business screen) */

  // The player's business as a place: plots along a quay, filled in as they buy.
  harbour(ctx, W, H, S, t) {
    ctx.clearRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, "#8ecae6"); sky.addColorStop(1, "#fff1d6");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.5);
    const quay = H * 0.56;
    const sea = ctx.createLinearGradient(0, quay, 0, H);
    sea.addColorStop(0, "#3aa6cf"); sea.addColorStop(1, "#16587c");
    ctx.fillStyle = sea; ctx.fillRect(0, quay, W, H - quay);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const y = quay + 14 + Art.h(i, 131) * (H - quay - 20);
      const x = (Art.h(i, 132) * W + t * 8) % W;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y); ctx.stroke();
    }
    // quay: a wide promenade, so the crew can stand in front of the buildings
    ctx.fillStyle = "#c9b594"; ctx.fillRect(0, quay - 12, W, 34);
    ctx.fillStyle = "rgba(120,100,70,0.25)";
    for (let x = 0; x < W; x += 26) ctx.fillRect(x, quay - 12, 1.5, 34);
    ctx.fillStyle = "#8a7658"; ctx.fillRect(0, quay + 20, W, 5);

    const plots = [
      { id: "dock", label: "Dock" }, { id: "baitshop", label: "Bait" }, { id: "market", label: "Market" },
      { id: "storage", label: "Cold store" }, { id: "aquarium", label: "Aquarium" }, { id: "charter", label: "Charter" }, { id: "hq", label: "HQ" },
    ];
    const pw = W / plots.length;
    plots.forEach((p, i) => {
      const x = i * pw + pw / 2, lv = Econ.own(S, p.id);
      this.building(ctx, p.id, x, quay - 12, Math.min(pw * 0.86, 110), lv, t);
    });

    // moored boats
    const boats = ["smallboat", "fishingboat", "charter", "trawler", "vessel"].filter((id) => Econ.own(S, id) > 0);
    boats.forEach((id, i) => {
      const size = Math.min(W / 5.5, 44 + i * 12);
      const x = W * 0.1 + i * (W * 0.8 / Math.max(1, boats.length - 1 || 1)) + (boats.length === 1 ? W * 0.3 : 0);
      const y = quay + 56 + (i % 2) * 16 + Math.sin(t * 1.4 + i) * 1.5;
      ctx.save(); ctx.translate(x, y); Art.boat(ctx, id, size, t); ctx.restore();
    });

    // helpers on the quay
    const helpers = TRACKS.filter((tr) => tr.helper && Econ.own(S, tr.id) > 0);
    const spots = [0.1, 0.27, 0.43, 0.6, 0.76, 0.92];
    helpers.forEach((tr, i) => {
      const bobble = Math.sin(t * 2 + i * 1.7) > 0.92 ? -2 : 0;
      ctx.save(); ctx.translate(W * spots[i % spots.length] - pw * 0.28, quay + 16 + bobble);
      Art.person(ctx, tr.id, Math.min(44, H * 0.2), {});
      ctx.restore();
    });
  },

  building(ctx, id, x, base, w, lv, t) {
    ctx.save(); ctx.translate(x, base);
    const h = w * 0.8;
    if (!lv) {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(90,70,50,0.5)"; ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.4, -h * 0.55, w * 0.8, h * 0.55);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(90,70,50,0.55)"; ctx.font = `800 ${Math.round(w * 0.22)}px 'Baloo 2', sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, -h * 0.28);
      ctx.restore(); return;
    }
    const grow = 1 + (lv - 1) * 0.15;
    const bw = w * 0.7 * grow, bh = h * 0.5 * grow;
    const pal = {
      dock: ["#a57a4e", "#6b4a2e"], baitshop: ["#8ac07a", "#4e7a3e"], market: ["#f2c04a", "#c84a3a"],
      storage: ["#dfe8ee", "#6ab0e0"], charter: ["#fffaf0", "#2aa38a"], hq: ["#f4f0e6", "#1f5fae"],
      aquarium: ["#bfe8ff", "#2f86b4"],
    }[id];
    if (id === "dock") {
      ctx.fillStyle = pal[0]; ctx.fillRect(-bw / 2, -8, bw, 8);
      ctx.fillStyle = pal[1]; for (let i = 0; i < 4; i++) ctx.fillRect(-bw / 2 + i * bw / 3.2, -8, 5, 40);
      if (lv >= 2) { ctx.strokeStyle = "#e8b43a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bw * 0.3, 0); ctx.lineTo(bw * 0.3, -bh * 1.3); ctx.lineTo(bw * 0.05, -bh * 1.1); ctx.stroke(); }
    } else {
      const hh = id === "hq" ? bh * 1.6 : bh;
      ctx.fillStyle = pal[0]; ctx.fillRect(-bw / 2, -hh, bw, hh);
      ctx.strokeStyle = shade(pal[0], -0.45); ctx.lineWidth = 2; ctx.strokeRect(-bw / 2, -hh, bw, hh);
      ctx.beginPath(); ctx.moveTo(-bw / 2 - 5, -hh); ctx.lineTo(0, -hh - bh * 0.45); ctx.lineTo(bw / 2 + 5, -hh); ctx.closePath();
      ctx.fillStyle = pal[1]; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#5a3a2a"; ctx.fillRect(-bw * 0.1, -hh * 0.45, bw * 0.2, hh * 0.45);
      ctx.fillStyle = "#9ad4f0";
      ctx.fillRect(-bw * 0.38, -hh * 0.75, bw * 0.18, hh * 0.22); ctx.fillRect(bw * 0.2, -hh * 0.75, bw * 0.18, hh * 0.22);
      if (id === "market") {
        for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? "#fff" : "#c84a3a"; ctx.fillRect(-bw / 2 + i * bw / 5, -hh * 0.98, bw / 5, hh * 0.14); }
      }
      if (id === "hq") {
        ctx.fillStyle = "#f2c032"; ctx.fillRect(-2, -hh - bh * 0.45 - 20, 3, 20);
        ctx.fillStyle = "#e8392e"; ctx.beginPath(); ctx.moveTo(1, -hh - bh * 0.45 - 20); ctx.lineTo(16 + Math.sin(t * 3) * 2, -hh - bh * 0.45 - 15); ctx.lineTo(1, -hh - bh * 0.45 - 10); ctx.fill();
      }
      if (id === "storage") { Art.star(ctx, bw * 0.3, -hh - 6, 5, "#bfe8ff"); }
      if (id === "aquarium") {
        ctx.save(); ctx.translate(0, -hh - bh * 0.16); ctx.scale(0.9, 0.9);
        ctx.fillStyle = "#f2c032";
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(15, -5 + Math.sin(t * 4) * 1.5); ctx.lineTo(15, 5 + Math.sin(t * 4) * 1.5); ctx.fill();
        ctx.restore();
      }
    }
    // level pips on the promenade in front of the door
    for (let i = 0; i < lv; i++) { Art.ellipse(ctx, 8 - ((lv - 1) * 5) + i * 10, 16, 3.5, 3.5); ctx.fillStyle = "#f2c032"; ctx.fill(); ctx.strokeStyle = "#8a6412"; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  },
};
