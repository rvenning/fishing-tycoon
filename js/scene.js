// Scene: the fishing view in the Storybook Pond style.
//
// Everything that never moves — sky, hills, trees, water, the dock or bank the
// player stands on — is painted once per location and size with the Paint
// toolkit and blitted. Only what moves is drawn live: sparkles and flow on the
// water, the fleet, the crew and player (cached sprites), the rod, the bobber,
// the catch, the weather and the reel gauge.
//
// Legibility budget, and the rule this file keeps:
//   * the bobber must read on every location's water, so nothing round, red or
//     white is ever painted inside the rectangle it can land in (see
//     `bobberZone`) — lily pads, rocks and reeds are kept to the edges;
//   * the bite badge, the gauge's marker and band, and money/haul (DOM) stay
//     the highest-contrast things on screen.

const WORLDS = {
  pond:  { sky: ["#bcdbe2", "#e8efe0", "#f4ead0"], far: "#a9c3b9", mid: "#a9c46e", water: ["#9ccbc0", "#5fa6a3", "#2f7078"], shore: "#5f8f38" },
  river: { sky: ["#c2e0ea", "#e6f0e6", "#eef0dc"], far: "#a8c4b4", mid: "#9cc06a", water: ["#a4d0dc", "#5f9fbe", "#2f6f96"], shore: "#4e8a44" },
  lake:  { sky: ["#b8d0ea", "#e4e6ea", "#f3e9d8"], far: "#8fa4c2", mid: "#6f9a6a", water: ["#9cc4dc", "#3d86b8", "#1f4f7e"], shore: "#3f6a4a" },
  pier:  { sky: ["#b9dcea", "#eaf0e6", "#fbecd0"], far: "#e2cb9c", mid: "#d9c08a", water: ["#9ad6e4", "#2f9ec4", "#17607f"], shore: "#b88a5a" },
  open:  { sky: ["#a6d2ee", "#dbe8ee", "#fde6c4"], far: "#b9d6ea", mid: "#b9d6ea", water: ["#8cc2ea", "#1f7cc0", "#0c3f72"], shore: "#1f7cc0" },
  deep:  { sky: ["#10183a", "#26305e", "#3a3a78"], far: "#1e2a5a", mid: "#1e2a5a", water: ["#2a4a7a", "#122a5a", "#050c24"], shore: "#122a5a" },
};

const Scene = {
  cv: null, ctx: null, W: 360, H: 640, dpr: 1,
  bottomInset: 120, topInset: 70,
  bake: null, bakeKey: "",
  harbourBake: null, harbourKey: "",
  reduceMotion: false,
  flying: null,
  crew: 0,

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

  geom() {
    const W = this.W, H = this.H;
    const floor = H - this.bottomInset;
    const portrait = H > W * 1.1;
    const horizon = Math.round(this.topInset + (floor - this.topInset) * (portrait ? 0.25 : 0.31));
    const size = Math.max(84, Math.min(170, Math.min(W * 0.26, (floor - horizon) * 0.42)));
    const crewRoom = Math.min(this.crew || 0, 3) * size * 0.52;
    const px = Math.max(size * 0.62, Math.min(Math.max(W * 0.2, size * 0.8 + crewRoom), W * 0.36));
    const py = floor - size * 0.08;
    // brush scale for scenery: bigger screens get bigger trees, within reason
    const k = Math.max(0.6, Math.min(1.35, Math.min(W, (floor - this.topInset) * 1.4) / 900));
    return { W, H, floor, horizon, size, px, py, u: size / 100, portrait, k };
  },

  // Where the engine may put the bobber. Decoration keeps out of here.
  bobberZone(g) {
    const x0 = g.px + g.size, x1 = g.W - 24, y0 = g.horizon + 20, y1 = g.floor - 40;
    return { x0: x0 + (x1 - x0) * 0.5 - 20, x1: x0 + (x1 - x0) * 0.84 + 20, y0: y0 + (y1 - y0) * 0.28 - 20, y1: y0 + (y1 - y0) * 0.64 + 24 };
  },

  /* ------------------------------------------------------------ the baked world */

  backdrop(loc, g) {
    const kind = loc.scene.kind;
    const key = `${kind}|${this.W}|${this.H}|${this.dpr}|${this.bottomInset}|${this.topInset}|${this.crew}`;
    if (this.bakeKey === key && this.bake) return this.bake;
    const cv = this.bake || document.createElement("canvas");
    cv.width = this.cv.width; cv.height = this.cv.height;
    const ctx = cv.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paintWorld(ctx, g, kind);
    Paint.grainOver(ctx, g.W, g.H, 0.38);
    this.bake = cv; this.bakeKey = key;
    return cv;
  },

  paintWorld(ctx, g, kind) {
    const P = Paint, Wd = WORLDS[kind];
    const { W, H, horizon: hz, k } = g;
    const R = P.mulberry(kind.length * 101 + 7);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, Wd.sky[0]); sky.addColorStop(0.65, Wd.sky[1]); sky.addColorStop(1, Wd.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 4);

    if (kind === "deep") {
      for (let i = 0; i < 110; i++) { const s = 0.8 + R() * 1.6; ctx.fillStyle = `rgba(255,250,225,${0.3 + R() * 0.6})`; ctx.fillRect(R() * W, R() * hz * 0.95, s, s); }
      const mx = W * 0.8, my = Math.max(this.topInset + 30, hz * 0.4), mr = 24 * k;
      const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
      glow.addColorStop(0, "rgba(255,248,210,0.35)"); glow.addColorStop(1, "rgba(255,248,210,0)");
      ctx.fillStyle = glow; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      P.shape(ctx, P.blob(mx, my, mr, mr, 3, 20, 0.03), "#f4efd2", 1.4, { pen: "#c8c0a0" });
      P.wash(ctx, P.blob(mx + mr * 0.35, my - mr * 0.2, mr * 0.8, mr * 0.8, 4, 18, 0.03), Wd.sky[0], { layers: 1, edge: 0, alpha: 0.85 });
    } else {
      const sx = W * 0.8, sy = Math.max(this.topInset + 20, hz * 0.42);
      const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 110 * k);
      sun.addColorStop(0, "rgba(255,244,200,0.9)"); sun.addColorStop(0.3, "rgba(255,230,160,0.4)"); sun.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = sun; ctx.fillRect(sx - 120 * k, sy - 120 * k, 240 * k, 240 * k);
      const nClouds = W > 700 ? 3 : 2;
      for (let i = 0; i < nClouds; i++) {
        const cx = W * (0.18 + i * 0.3) + R() * 40, cy = this.topInset * 0.6 + (hz - this.topInset) * (0.15 + R() * 0.35);
        P.cloud(ctx, cx, cy, (0.65 + R() * 0.4) * k, i + 1, kind === "pier" || kind === "open" ? "#d8c9b8" : "#c9dbe0");
      }
    }

    // far and middle ground
    const tl = { W, hz, k };
    switch (kind) {
      case "pond":
        P.hills(ctx, W, hz - 74 * k, 34 * k, 0.005 / k, 1, Wd.far, { bottom: hz + 4 });
        P.hills(ctx, W, hz - 44 * k, 20 * k, 0.009 / k, 3, Wd.mid, { bottom: hz + 4, layers: 3 });
        for (let i = 0; i < 4; i++) {
          const fx = W * (0.4 + i * 0.16), fy = hz - 42 * k - R() * 8 * k;
          P.wash(ctx, P.blob(fx, fy, 64 * k, 10 * k, i + 20, 18, 0.12), ["#c7cf7a", "#98ba5c", "#b8c870", "#c2cc76"][i], { layers: 1, edge: 0.25, alpha: 0.8 });
          P.dabs(ctx, fx, fy + 12 * k, 60 * k, 3 * k, "#4f7f32", 10, i + 40, 2.6 * k, 0.7);
        }
        P.cottage(ctx, W * 0.74, hz - 50 * k, 0.8 * k);
        this.treeLine(ctx, tl, kind, 0.3);
        break;
      case "river":
        P.hills(ctx, W, hz - 84 * k, 44 * k, 0.005 / k, 2, Wd.far, { bottom: hz + 4 });
        P.hills(ctx, W, hz - 42 * k, 22 * k, 0.011 / k, 5, Wd.mid, { bottom: hz + 4, layers: 3 });
        this.treeLine(ctx, tl, kind, 0.2);
        // a stone bridge far away, arching over its own shadow
        {
          const bx = W * 0.3, bw = 110 * k, by = hz + 2;
          P.shape(ctx, [[bx, by - 18 * k], [bx + bw, by - 18 * k], [bx + bw, by], [bx, by]], "#b8ab98", 1.2);
          for (let i = 0; i < 3; i++) P.wash(ctx, P.blob(bx + bw * (0.18 + i * 0.32), by, 13 * k, 10 * k, i + 30, 14, 0.05), Wd.water[0], { layers: 1, edge: 0.3 });
        }
        break;
      case "lake": {
        const peaks = W > 700 ? [[0.08, 0.6], [0.28, 1], [0.5, 0.75], [0.72, 1.08], [0.94, 0.7]] : [[0.12, 0.7], [0.45, 1], [0.85, 0.85]];
        for (const [fx, fh] of peaks) {
          const x = W * fx, h = Math.min(hz - this.topInset * 0.4, 190 * k) * fh, w = h * 1.15;
          P.shape(ctx, [[x - w, hz + 2], [x - w * 0.3, hz - h * 0.6], [x, hz - h], [x + w * 0.35, hz - h * 0.55], [x + w, hz + 2]], Wd.far, 1.3, { penAlpha: 0.45 });
          P.wash(ctx, [[x - h * 0.3, hz - h * 0.7], [x - h * 0.12, hz - h * 0.8], [x, hz - h], [x + h * 0.14, hz - h * 0.78], [x + h * 0.3, hz - h * 0.68], [x + h * 0.1, hz - h * 0.73], [x - h * 0.08, hz - h * 0.66]], "#f7f8f8", { layers: 2, edge: 0.2 });
        }
        P.hills(ctx, W, hz - 6 * k, 8 * k, 0.02 / k, 4, Wd.mid, { bottom: hz + 4 });
        this.treeLine(ctx, tl, kind, 0.85);
        break;
      }
      case "pier": {
        P.hills(ctx, W, hz - 8 * k, 6 * k, 0.02 / k, 1, "#e8d6a8", { bottom: hz + 4 });
        const cols = ["#e86a5a", "#f2c04a", "#6ab0e0", "#f4f0e6", "#8ac07a", "#e89ac0"];
        const step = Math.max(24, 30 * k);
        for (let i = 0, x = W * 0.26; x < W * 0.86; i++, x += step + R() * 8) {
          const w = (18 + R() * 10) * k, h = (20 + R() * 26) * k;
          P.shape(ctx, [[x, hz], [x, hz - h], [x + w, hz - h], [x + w, hz]], cols[i % cols.length], 1.1, { penAlpha: 0.6 });
          P.shape(ctx, [[x - 3 * k, hz - h], [x + w / 2, hz - h - 11 * k], [x + w + 3 * k, hz - h]], "#9a4a3a", 1.1, { penAlpha: 0.6 });
          P.wash(ctx, [[x + 4 * k, hz - h + 6 * k], [x + 10 * k, hz - h + 6 * k], [x + 10 * k, hz - h + 12 * k], [x + 4 * k, hz - h + 12 * k]], "#4a6a8a", { layers: 1, edge: 0, alpha: 0.6 });
        }
        const lx = W * 0.93, lh = Math.min(hz - this.topInset * 0.6, 100 * k);
        P.shape(ctx, [[lx - 10 * k, hz], [lx - 6 * k, hz - lh], [lx + 6 * k, hz - lh], [lx + 10 * k, hz]], "#f4f0e6", 1.3);
        for (let i = 0; i < 3; i++) P.wash(ctx, [[lx - 9 * k + i, hz - lh * (0.2 + i * 0.25)], [lx + 9 * k - i, hz - lh * (0.2 + i * 0.25)], [lx + 8 * k - i, hz - lh * (0.3 + i * 0.25)], [lx - 8 * k + i, hz - lh * (0.3 + i * 0.25)]], "#cf4434", { layers: 1, edge: 0 });
        P.shape(ctx, [[lx - 7 * k, hz - lh], [lx - 7 * k, hz - lh - 12 * k], [lx + 7 * k, hz - lh - 12 * k], [lx + 7 * k, hz - lh]], "#f2c04a", 1.2);
        break;
      }
      case "open": {
        const ix = W * 0.72, iy = hz + 1;
        P.shape(ctx, P.blob(ix, iy, 70 * k, 12 * k, 3, 18, 0.08), "#e8d6a0", 1.2, { penAlpha: 0.5 });
        P.shape(ctx, P.blob(ix, iy - 5 * k, 40 * k, 14 * k, 4, 16, 0.1), "#6aa65a", 1.2, { penAlpha: 0.5 });
        P.line(ctx, () => { ctx.moveTo(ix + 4 * k, iy - 10 * k); ctx.quadraticCurveTo(ix + 10 * k, iy - 34 * k, ix, iy - 52 * k); }, 3 * k, "#7a5a3a");
        for (let i = 0; i < 5; i++) P.wash(ctx, P.blob(ix + Math.cos(i * 1.26) * 14 * k, iy - 54 * k + Math.sin(i * 1.26) * 5 * k, 16 * k, 4.5 * k, i, 10, 0.1), "#4e8a44", { layers: 1, edge: 0.4 });
        break;
      }
      case "deep":
        P.hills(ctx, W, hz - 4 * k, 6 * k, 0.01 / k, 1, "#1a2450", { bottom: hz + 4, edge: 0 });
        break;
    }

    // water
    const wg = ctx.createLinearGradient(0, hz, 0, H);
    wg.addColorStop(0, Wd.water[0]); wg.addColorStop(0.35, Wd.water[1]); wg.addColorStop(1, Wd.water[2]);
    ctx.fillStyle = wg; ctx.fillRect(0, hz, W, H - hz);
    if (kind === "pond" || kind === "river" || kind === "lake") {
      // the far shore mirrored in the water
      ctx.save();
      ctx.beginPath(); ctx.rect(0, hz, W, H - hz); ctx.clip();
      ctx.globalAlpha = 0.16; ctx.filter = "blur(1.5px)";
      ctx.translate(0, hz * 2 + 2); ctx.scale(1, -0.85);
      this.treeLine(ctx, tl, kind, kind === "lake" ? 0.85 : kind === "river" ? 0.2 : 0.3, true);
      ctx.restore();
    }
    const RS = P.mulberry(kind.length * 7 + 1);
    for (let i = 0; i < 90; i++) {
      const y = hz + 6 + Math.pow(RS(), 1.4) * (H - hz), x = RS() * W, l = (10 + RS() * 40 * ((y - hz) / (H - hz) + 0.3)) * k;
      ctx.strokeStyle = kind === "deep" ? `rgba(140,190,255,${0.05 + RS() * 0.08})` : RS() < 0.62 ? "rgba(255,255,240,0.24)" : "rgba(20,60,80,0.14)";
      ctx.lineWidth = 1 + RS() * 2 * k; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l * 0.5, y - 1.5, x + l, y); ctx.stroke();
    }
    P.line(ctx, () => { ctx.moveTo(-10, hz + 1); ctx.quadraticCurveTo(W / 2, hz + 5, W + 10, hz + 1); }, 1.3, kind === "deep" ? "#8a90c0" : Paint.INK, 0.35);

    this.paintShore(ctx, g, kind);
  },

  // A row of trees along the far shore, seeded per location.
  treeLine(ctx, tl, kind, coniferShare, mirror) {
    const { W, hz, k } = tl;
    const R = Paint.mulberry(kind.length * 53 + 11);
    const spacing = 34 * k;
    for (let x = -10; x < W + 20; x += spacing * (0.7 + R() * 0.6)) {
      const y = hz + 2 + R() * 6 * k, s = (0.55 + R() * 0.35) * k, seed = Math.floor(x);
      if (R() < coniferShare) Paint.conifer(ctx, x, y, s, seed, kind === "lake" ? "#3f6a4a" : "#4f7f32");
      else Paint.tree(ctx, x, y, s, seed + 100);
      void mirror;
    }
  },

  // What the player stands on, plus the plants and pads around it. All static.
  paintShore(ctx, g, kind) {
    const P = Paint;
    const { W, H, floor, px, py, size, u, k, horizon: hz } = g;
    const zone = this.bobberZone(g);
    const clear = (x, y, r) => x + r < zone.x0 || x - r > zone.x1 || y + r < zone.y0 || y - r > zone.y1;

    if (kind === "pond") {
      // an overhanging tree framing the top-left corner
      // (the canopy only: its trunk sat behind the HUD and read as a dark blob)
      const canopy = [[0.02, 0.2, 70], [0.12, 0.05, 62], [0.22, 0.25, 56], [0.3, 0.55, 42], [0.06, 0.8, 50], [0.16, 0.85, 44], [-0.02, 1.4, 48], [0.26, 1.05, 34]];
      for (const [fx, fy, r] of canopy) {
        const x = W * fx, y = this.topInset * fy, rr = r * k, col = P.GREENS[Math.floor(fx * 100) % 5];
        P.wash(ctx, P.blob(x, y, rr, rr * 0.8, fx * 100 + 500, 20, 0.2), col, { layers: 3, edge: 0.35, seed: fy * 10 });
      }
      for (const [fx, fy, r] of canopy) {
        const x = W * fx, y = this.topInset * fy, rr = r * k, col = P.GREENS[Math.floor(fx * 100) % 5];
        P.wash(ctx, P.blob(x - rr * 0.2, y - rr * 0.25, rr * 0.6, rr * 0.45, fx * 100 + 600, 16, 0.2), P.light(col, 0.3), { layers: 1, edge: 0, alpha: 0.5 });
        P.dabs(ctx, x, y, rr, rr * 0.8, P.dark(col, 0.4), 24, fx * 100, 3 * k, 0.5);
        P.ink(ctx, P.blob(x, y, rr, rr * 0.8, fx * 100 + 500, 20, 0.2), true, 1.4, P.INK, 0.35);
      }

      // the dock the player stands on: straight planks in gentle perspective
      const end = px + size * 0.62;
      const backY = py - 22 * u, frontY = py + 16 * u;
      const deck = () => { ctx.beginPath(); ctx.moveTo(-30, backY); ctx.lineTo(end - 6 * u, backY); ctx.lineTo(end + 12 * u, frontY); ctx.lineTo(-30, frontY); ctx.closePath(); };
      // posts first, so the deck sits on them
      for (let x = 16 * u; x < end + 10 * u; x += size * 0.5) {
        P.shape(ctx, [[x, frontY], [x + 11 * u, frontY], [x + 12 * u, floor + 40], [x - 1 * u, floor + 40]], "#6e4424", 1.6);
        ctx.fillStyle = "rgba(20,50,50,0.2)"; ctx.fillRect(x - 2 * u, floor - 6, 16 * u, 8);
      }
      ctx.save(); deck(); ctx.clip();
      ctx.fillStyle = "#b27a45"; ctx.fillRect(-30, backY, end + 60, frontY - backY);
      ctx.globalAlpha = 0.45; ctx.drawImage(P.wood(), 0, 0, 900, 86, -30, backY, end + 70, frontY - backY); ctx.globalAlpha = 1;
      for (let x = -30 + 24 * u, i = 0; x < end + 20 * u; x += 24 * u, i++) {
        P.line(ctx, () => { ctx.moveTo(x - 2 * u, backY); ctx.lineTo(x + 5 * u, frontY); }, 1.6, "#6e4424", 0.65);
      }
      ctx.fillStyle = "rgba(255,230,190,0.25)"; ctx.fillRect(-30, backY, end + 60, 4 * u);
      ctx.restore();
      deck(); ctx.strokeStyle = P.rgba(P.INK, 0.9); ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30, frontY); ctx.lineTo(end + 12 * u, frontY); ctx.lineTo(end + 12 * u, frontY + 9 * u); ctx.lineTo(-30, frontY + 9 * u); ctx.closePath();
      ctx.fillStyle = "#7a4e2a"; ctx.fill(); ctx.stroke();
      // reeds at the end of the dock, pads kept to the front and the far edge
      for (let i = 0; i < 6; i++) P.reed(ctx, end + (16 + i * 9) * u, py + 26 * u, (70 + (i % 3) * 22) * u, (i - 2.5) * 3 * u, 0, i, i % 2 === 0);
      const pads = [[W - 60 * k, floor - 24 * k, 30 * k, true], [end + size * 0.55, floor - 14 * k, 22 * k, false], [W - 140 * k, floor - 6 * k, 26 * k, false], [W - 30 * k, hz + (floor - hz) * 0.2, 20 * k, true]];
      for (const [x, y, r, fl] of pads) if (clear(x, y, r)) P.lilyPad(ctx, x, y, r, Math.floor(x), fl);
      P.flowers(ctx, 0, py + 26 * u, end, 20 * u, 11, 8, k);
    } else if (kind === "river" || kind === "lake") {
      const edge = px + size * 0.62;
      const grass = kind === "lake" ? "#6a8a5a" : "#6f9a3e";
      const ground = kind === "lake" ? "#7a7568" : "#8a6a4a";
      P.shape(ctx, [[-20, py - 6 * u], [edge * 0.5, py - 16 * u], [edge * 0.9, py - 10 * u], [edge, py - 2 * u], [edge + 36 * u, py + 18 * u], [edge + 70 * u, H], [-20, H]], ground, 2);
      P.shape(ctx, [[-20, py - 6 * u], [edge * 0.5, py - 16 * u], [edge * 0.9, py - 10 * u], [edge, py - 2 * u], [edge - 6 * u, py + 8 * u], [edge * 0.6, py + 2 * u], [edge * 0.3, py + 4 * u], [-20, py + 6 * u]], grass, 1.8);
      for (let i = 0; i < 7; i++) P.grassTuft(ctx, (i + 0.5) * edge / 7, py - 6 * u, 0.9 * u, P.dark(grass, 0.1), i + 50);
      if (kind === "lake") {
        P.rock(ctx, edge * 0.22, py + 2 * u, 20 * u, 10 * u, 3, "#9a9a8e");
        P.rock(ctx, edge + 30 * u, py + 22 * u, 16 * u, 9 * u, 4, "#8a8a80");
        P.conifer(ctx, 26 * k, py - 10 * u, 1.3 * k, 9, "#3f6a4a");
      } else {
        P.rock(ctx, edge + 22 * u, py + 20 * u, 14 * u, 8 * u, 5, "#a39a88");
        P.flowers(ctx, 10, py - 10 * u, edge * 0.8, 12 * u, 7, 10, k);
      }
      for (let i = 0; i < 5; i++) P.reed(ctx, edge + (10 + i * 9) * u, py + 18 * u, (60 + (i % 3) * 20) * u, (i - 2) * 3 * u, 0, i, i % 2 === 0);
    } else if (kind === "pier") {
      const end = px + size * 0.55, deck = py;
      for (let x = 12; x < end; x += size * 0.5) P.shape(ctx, [[x, deck + 8 * u], [x + 10 * u, deck + 8 * u], [x + 10 * u, H], [x, H]], "#6e4424", 1.6);
      const top = [[-20, deck - 14 * u], [end - 6 * u, deck - 14 * u], [end + 6 * u, deck + 12 * u], [-20, deck + 12 * u]];
      ctx.save(); P.trace(ctx, top); ctx.clip();
      ctx.fillStyle = "#a57a4e"; ctx.fillRect(-20, deck - 16 * u, end + 40, 30 * u);
      ctx.globalAlpha = 0.5; ctx.drawImage(P.wood(), 0, 0, 900, 86, -20, deck - 14 * u, end + 40, 26 * u); ctx.globalAlpha = 1;
      for (let x = -20 + 22 * u; x < end + 10 * u; x += 22 * u) P.line(ctx, () => { ctx.moveTo(x - 2 * u, deck - 14 * u); ctx.lineTo(x + 4 * u, deck + 12 * u); }, 1.4, "#6e4424", 0.6);
      ctx.restore();
      P.ink(ctx, top, true, 2);
      P.shape(ctx, [[-20, deck + 12 * u], [end + 6 * u, deck + 12 * u], [end + 6 * u, deck + 20 * u], [-20, deck + 20 * u]], "#7a4e2a", 1.8);
      P.shape(ctx, [[end - 7 * u, deck - 44 * u], [end, deck - 44 * u], [end, deck], [end - 7 * u, deck]], "#8a6038", 1.6);
      P.shape(ctx, [[-20, deck - 40 * u], [end, deck - 40 * u], [end, deck - 35 * u], [-20, deck - 35 * u]], "#8a6038", 1.4);
      P.shape(ctx, P.blob(end - 30 * u, deck - 8 * u, 12 * u, 5 * u, 6, 14, 0.05), "#d8c8a0", 1.4);
    }

    if (kind !== "open" && kind !== "deep") {
      // a few reeds and pads at the right-hand edge of the water, never in the bobber zone
      for (let i = 0; i < 4; i++) {
        const x = W - (12 + i * 10) * k, y = floor + 10;
        if (clear(x, y - 60 * k, 10)) P.reed(ctx, x, y, (80 + (i % 2) * 30) * k, -(i + 1) * 3 * k, 0, i + 90, i % 2 === 0);
      }
    }
  },

  /* ------------------------------------------------------------ per-frame */

  draw(t, S, ev, fish) {
    const ctx = this.ctx;
    const loc = LOCATION[S.loc];
    const kind = loc.scene.kind;
    this.crew = kind === "open" || kind === "deep" ? 0
      : TRACKS.filter((tr) => tr.helper && tr.id !== "kofi" && Econ.own(S, tr.id) > 0).length;
    const g = this.geom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop(loc, g), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const [shx, shy] = Fx.shakeOffset();
    ctx.save();
    ctx.translate(shx, shy);
    this.water(ctx, g, t, kind);
    this.fleet(ctx, g, t, S);
    if (ev && ev.id === "shadow") this.shadow(ctx, g, t);
    if (ev && ev.id === "ripple") this.swirl(ctx, g, t);
    if (kind === "pond") this.duck(ctx, g, t);
    this.foreground(ctx, g, t, S, kind);
    this.rig(ctx, g, t, S, fish);
    this.flyingCatch(ctx, g);
    Fx.render(ctx);
    this.weather(ctx, g, t, ev);
    ctx.restore();

    if (fish.phase === "reel" && fish.reel) this.meter(ctx, g, fish.reel, t);
    if (Fx.flash > 0.01) {
      ctx.fillStyle = Fx.flashColor; ctx.globalAlpha = Math.min(1, Fx.flash); ctx.fillRect(0, 0, g.W, g.H); ctx.globalAlpha = 1;
    }
  },

  // Only the living parts of the water: sparkle, flow, and deep-sea lights.
  water(ctx, g, t, kind) {
    const { W, H, horizon: hz, k } = g;
    const still = this.reduceMotion;
    if (kind === "river") {
      ctx.lineCap = "round";
      for (let i = 0; i < 22; i++) {
        const depth = (i + 0.5) / 22, y = hz + 8 + depth * (H - hz);
        const x = ((Art.h(i, 51) * W + (still ? 0 : t * 24 * (0.4 + depth))) % (W + 60)) - 30;
        ctx.strokeStyle = `rgba(255,255,240,${0.2 + depth * 0.2})`; ctx.lineWidth = (1 + depth * 2) * k;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14 * k, y - 2, x + (18 + depth * 36) * k, y); ctx.stroke();
      }
    }
    if (kind === "deep") {
      for (let i = 0; i < 16; i++) {
        const x = Art.h(i, 61) * W, y = hz + 20 + Art.h(i, 62) * (H - hz - 40);
        const a = still ? 0.35 : 0.25 + 0.35 * Math.sin(t * (0.8 + Art.h(i, 63)) + i);
        if (a <= 0) continue;
        ctx.fillStyle = `rgba(120,255,230,${a})`; Art.ellipse(ctx, x, y, 2.4, 2.4); ctx.fill();
      }
      return;
    }
    for (let i = 0; i < 12; i++) {
      const x = Art.h(i, 71) * W + (still ? 0 : Math.sin(t * 0.3 + i) * 6), y = hz + 20 + Art.h(i, 72) * (H - hz - 40);
      const a = still ? 0.35 : 0.3 + 0.35 * Math.sin(t * 2 + i * 1.7);
      if (a > 0.05) Art.star(ctx, x, y, 2.6 * k, `rgba(255,255,240,${a})`);
    }
  },

  duck(ctx, g, t) {
    const P = Paint, { W, horizon: hz, k } = g;
    const still = this.reduceMotion;
    const dx = W * 0.88 + (still ? 0 : Math.sin(t * 0.22) * 26 * k), dy = hz + 34 * k + (still ? 0 : Math.sin(t * 1.3) * 1.2);
    this.ripples(ctx, dx, dy + 10 * k, t * 0.5, 0.6);
    const s = 0.8 * k;
    ctx.save(); ctx.translate(dx, dy); ctx.scale(s, s);
    P.shape(ctx, P.blob(0, 0, 22, 10, 3, 14, 0.06), "#9a7048", 1.6);
    P.shape(ctx, P.blob(-17, -14, 8, 7, 4, 12, 0.05), "#6f5a3a", 1.4);
    P.wash(ctx, [[-24, -14], [-34, -12], [-24, -10]], "#e8a33a", { layers: 1 });
    ctx.beginPath(); ctx.arc(-19, -16, 1.4, 0, Math.PI * 2); ctx.fillStyle = P.INK; ctx.fill();
    ctx.restore();
  },

  // Every boat the business owns sails past in the distance.
  fleet(ctx, g, t, S) {
    const { W, horizon } = g;
    const inland = ["pond", "river", "lake"].includes(LOCATION[S.loc].scene.kind);
    const boats = (inland ? ["smallboat"] : ["smallboat", "fishingboat", "charter", "trawler", "vessel"]).filter((id) => Econ.own(S, id) > 0);
    boats.forEach((id, i) => {
      const size = (34 + i * 7) * g.k;
      const speed = 7 + Art.h(i, 81) * 5;
      const span = W + size * 3;
      const x = ((Art.h(i, 82) * span + (this.reduceMotion ? 0 : t * speed)) % span) - size * 1.5;
      const y = horizon + (10 + i * 9) * g.k + (this.reduceMotion ? 0 : Math.sin(t * 1.3 + i) * 1.2);
      ctx.save(); ctx.translate(x, y); Art.boat(ctx, id, size, t); ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x - size * 0.5, y + 2, size * 1.05, 1.5);
    });
  },

  foreground(ctx, g, t, S, kind) {
    const { px, py, size, u } = g;
    const helpers = TRACKS.filter((tr) => tr.helper && Econ.own(S, tr.id) > 0).map((tr) => tr.id);
    if (kind === "pond" || kind === "river" || kind === "lake") {
      this.bucket(ctx, px - size * 0.42, py - 4, u, S);
      this.helpers(ctx, g, helpers.filter((h) => h !== "kofi"), (i) => ({ x: px - size * (0.95 + i * 0.52), y: py - 4, sit: true }));
      Paint.drawPerson(ctx, "you", px, py, size, false);
    } else if (kind === "pier") {
      this.bucket(ctx, px - size * 0.4, py - 2, u, S);
      this.helpers(ctx, g, helpers.filter((h) => h !== "kofi"), (i) => ({ x: px - size * (0.9 + i * 0.45), y: py - 2, sit: false }));
      this.gull(ctx, px + size * 0.55 - 3, py - 44 * u, u, t);
      Paint.drawPerson(ctx, "you", px, py, size, false);
    } else {
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
      if (Econ.own(S, "kofi")) Paint.drawPerson(ctx, "kofi", px - size * (kind === "deep" ? 0.5 : 0.62), deckY, size * 0.78, false);
      Paint.drawPerson(ctx, "you", px, deckY, size, false);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 6; i++) {
        const x = px - bsize * 0.45 + i * bsize * 0.2 + (this.reduceMotion ? 0 : Math.sin(t * 2 + i) * 3);
        Art.ellipse(ctx, x, deckY + (hullH + 8) * bu, 10, 3); ctx.fill();
      }
    }
  },

  bob(t, kind) { return (kind === "open" || kind === "deep") && !this.reduceMotion ? Math.sin(t * 1.6) * 2.2 : 0; },

  helpers(ctx, g, ids, place) {
    ids.slice(0, 4).forEach((id, i) => {
      const p = place(i);
      if (p.x < 10) return;
      const s = g.size * 0.72, su = s / 100;
      Paint.drawPerson(ctx, id, p.x, p.y, s, p.sit);
      if (id === "sam") {
        Paint.line(ctx, () => { ctx.moveTo(p.x + 20 * su, p.y - 48 * su); ctx.lineTo(p.x + 74 * su, p.y - 104 * su); }, Math.max(2, 3 * su), "#8a5a32");
        Paint.line(ctx, () => { ctx.moveTo(p.x + 74 * su, p.y - 104 * su); ctx.lineTo(p.x + 82 * su, p.y + 28 * su); }, 1, "#fffdf2", 0.7);
      }
    });
  },

  gull(ctx, x, y, u, t) {
    const P = Paint, s = u * 0.9;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    P.shape(ctx, P.blob(0, -7, 9, 6, 1, 12, 0.05), "#fbfbf7", 1.3);
    P.shape(ctx, P.blob(7, -13, 5, 4.5, 2, 10, 0.05), "#fbfbf7", 1.3);
    P.wash(ctx, P.blob(-2, -8, 7, 3.5, 3, 10, 0.05), "#8a9aa6", { layers: 1, edge: 0 });
    P.wash(ctx, [[11, -13], [17, -12], [11, -11]], "#f2a030", { layers: 1, edge: 0 });
    ctx.fillStyle = P.INK; Art.ellipse(ctx, 8, -14, 1, 1); ctx.fill();
    ctx.restore();
    void t;
  },

  // A basket that fills as the haul does, and turns red when it is full.
  bucket(ctx, x, y, u, S) {
    const P = Paint, cap = Econ.capacity(S), n = S.haul.length;
    const f = Math.min(1, n / Math.max(1, cap));
    const w = 24 * u, h = 20 * u;
    ctx.save(); ctx.translate(x, y);
    if (f > 0) {
      for (let i = 0; i < Math.min(5, Math.ceil(f * 5)); i++) {
        ctx.save(); ctx.translate((-6 + i * 3) * u, -h - 2 * u); ctx.rotate(-0.6 + i * 0.3);
        P.wash(ctx, [[0, 0], [-3 * u, -9 * u], [3 * u, -9 * u]], ["#8fa7b3", "#e0a526", "#7c9a3c", "#e0675e", "#4f7ea1"][i], { layers: 1, edge: 0.4 });
        ctx.restore();
      }
    }
    P.shape(ctx, [[-w / 2, -h], [w / 2, -h], [w * 0.4, 0], [-w * 0.4, 0]], f >= 1 ? "#cf4434" : "#c89a5a", Math.max(1.2, 1.6 * u));
    P.line(ctx, () => { for (let i = 1; i < 3; i++) { ctx.moveTo(-w * (0.5 - i * 0.03), -h + i * h / 3); ctx.lineTo(w * (0.5 - i * 0.03), -h + i * h / 3); } }, 1, "#6e4424", 0.5);
    P.line(ctx, () => ctx.arc(0, -h, w * 0.45, Math.PI, 0), Math.max(1.2, 2 * u), "#7a5230", 0.9);
    ctx.restore();
  },

  rodAngle(fish, t) {
    const up = -1.05;
    const wob = this.reduceMotion ? 0 : 1;
    switch (fish.phase) {
      case "cast": {
        const q = fish.t / CAST_TIME;
        if (q < 0.35) return up - (q / 0.35) * 0.95;
        if (q < 0.62) return up - 0.95 + ((q - 0.35) / 0.27) * 1.5;
        return -0.62;
      }
      case "wait": return -0.66 + Math.sin(t * 1.2) * 0.02 * wob;
      case "bite": return -0.56 + Math.sin(t * 30) * 0.03 * wob;
      case "reel": return -0.88 - (fish.reel ? fish.reel.p * 0.25 : 0);
      case "show": return -1.2 + Math.min(1, fish.t * 3) * 0.1;
      default: return up + Math.sin(t * 0.9) * 0.02 * wob;
    }
  },

  // The rod, the line and the bobber.
  rig(ctx, g, t, S, fish) {
    const P = Paint;
    const loc = LOCATION[S.loc];
    const hx = g.px + 20 * g.u, hy = g.py - 56 * g.u + this.bob(t, loc.scene.kind);
    const look = TRACK.rod.levels[Econ.own(S, "rod") - 1].look;
    const len = g.size * 1.25 * look.len;
    const ang = this.rodAngle(fish, t);
    const tension = fish.phase === "reel" && fish.reel ? 0.3 + fish.reel.p * 0.6 : fish.phase === "bite" ? 0.25 : 0.05;
    const tipX = hx + Math.cos(ang) * len, tipY = hy + Math.sin(ang) * len + tension * len * 0.18;
    const still = this.reduceMotion;

    const water = { x0: g.px + g.size, x1: g.W - 24, y0: g.horizon + 20, y1: g.floor - 40 };
    const target = { x: water.x0 + (water.x1 - water.x0) * fish.target.x, y: water.y0 + (water.y1 - water.y0) * fish.target.y };
    let bx = null, by = null, under = 0;
    if (fish.phase === "cast") {
      const q = fish.t / CAST_TIME;
      if (q > 0.45) {
        const f = (q - 0.45) / 0.55;
        bx = tipX + (target.x - tipX) * f;
        by = tipY + (target.y - tipY) * f - Math.sin(f * Math.PI) * (g.H * 0.18);
      }
    } else if (fish.phase === "wait") {
      bx = target.x; by = target.y + (still ? 0 : Math.sin(t * 2.4) * 1.5);
      if (fish.waitFor - fish.t < 0.6 && !still) bx += Math.sin(t * 40) * 1.2;
    } else if (fish.phase === "bite") {
      bx = target.x + (still ? 0 : Math.sin(t * 38) * 2.5); by = target.y + 5; under = 1;
    } else if (fish.phase === "reel" && fish.reel) {
      const r = fish.reel;
      bx = target.x + (hx + g.size * 0.8 - target.x) * r.prog + (r.p - r.c) * 60;
      by = target.y + (g.floor - 30 - target.y) * r.prog * 0.6 + (still ? 0 : Math.sin(t * 9) * 2);
      under = 0.6;
    }

    // rod: a dark core stroke, the rod's own colour, a tip
    const bend = tension * 0.35;
    const midX = hx + Math.cos(ang) * len * 0.55 + Math.cos(ang + Math.PI / 2) * len * bend * 0.3;
    const midY = hy + Math.sin(ang) * len * 0.55 + Math.sin(ang + Math.PI / 2) * len * bend * 0.3;
    const rod = () => { ctx.moveTo(hx - Math.cos(ang) * 14 * g.u, hy - Math.sin(ang) * 14 * g.u); ctx.quadraticCurveTo(midX, midY, tipX, tipY); };
    P.line(ctx, rod, (6.5 * (look.thick || 1)) * g.u + 2, P.INK, 1);
    P.line(ctx, rod, 3.8 * (look.thick || 1) * g.u, look.c, 1);
    P.line(ctx, () => { ctx.moveTo(midX + (tipX - midX) * 0.6, midY + (tipY - midY) * 0.6); ctx.lineTo(tipX, tipY); }, 2.2 * g.u, look.tip, 1);
    if (look.shine) Art.star(ctx, midX, midY, 5 + (still ? 0 : Math.sin(t * 3) * 1.5), "#fffbe0");
    Art.ellipse(ctx, hx + Math.cos(ang) * 4 * g.u, hy + Math.sin(ang) * 4 * g.u + 7 * g.u, 6.5 * g.u, 6.5 * g.u);
    ctx.fillStyle = "#c9ccd2"; ctx.fill(); ctx.strokeStyle = P.INK; ctx.lineWidth = 1.6; ctx.stroke();

    if (bx === null) {
      const sway = still ? 0 : Math.sin(t * 1.8) * 4;
      P.line(ctx, () => { ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + sway, tipY + 22 * g.u); }, 1, "#fffdf2", 0.85);
      this.bobber(ctx, tipX + sway, tipY + 28 * g.u, g.u, 0);
      return;
    }
    const sag = fish.phase === "reel" ? 4 : fish.phase === "bite" ? 10 : 40;
    P.line(ctx, () => { ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + sag, bx, by - 10 * g.u); }, 1.4, "#fffdf2", 0.92);

    if (fish.phase !== "cast") this.ripples(ctx, bx, by + 4, t, fish.phase === "bite" ? 2 : 1);
    if (fish.phase === "bite") P.splash(ctx, bx, by, g.u * 0.8, Math.floor(t * 6));
    this.bobber(ctx, bx, by, g.u, under);

    if (fish.phase === "bite") {
      const pulse = still ? 1 : 1 + Math.sin(t * 14) * 0.09;
      const r = Math.max(18, 22 * g.u) * pulse;
      P.badge(ctx, bx, by - 52 * g.u - r * 0.4, r);
    }
    if (fish.phase === "reel" && !still && Math.random() < 0.3) Fx.splash(bx + (Math.random() - 0.5) * 16, by + 2, "#e8f6ff", 1);
  },

  // Kept as its own method: main.js wraps it to remember where the bobber is.
  bobber(ctx, x, y, u, under) {
    Paint.bobber(ctx, x, y, Math.max(7, 9 * u), under);
  },

  ripples(ctx, x, y, t, strength) {
    for (let i = 0; i < 3; i++) {
      const q = this.reduceMotion ? (i + 1) / 4 : ((t * (0.6 + strength * 0.5) + i / 3) % 1);
      ctx.strokeStyle = `rgba(255,255,245,${(1 - q) * 0.6})`;
      ctx.lineWidth = 1.6;
      Art.ellipse(ctx, x, y, 6 + q * 26 * strength, (6 + q * 26 * strength) * 0.32);
      ctx.stroke();
    }
  },

  launch(c, gold, from) {
    this.flying = { c, gold, from, t: 0 };
  },

  flyingCatch(ctx, g) {
    const f = this.flying;
    if (!f) return;
    const dur = 0.6;
    const q = Math.min(1, f.t / dur);
    const to = { x: g.px + g.size * 0.75, y: g.py - g.size * 1.25 };
    const x = f.from.x + (to.x - f.from.x) * q;
    const y = f.from.y + (to.y - f.from.y) * q - Math.sin(q * Math.PI) * g.size * 0.9;
    const w = g.size * (0.55 + 0.25 * q);
    const spr = Art.sprite(f.c, 120, f.gold ? "gold" : "full");
    ctx.save(); ctx.translate(x, y); ctx.rotate((1 - q) * -0.9 + Math.sin(f.t * 20) * 0.08 * (1 - q));
    ctx.globalAlpha = q >= 1 ? Math.max(0, 1 - (f.t - dur) * 3) : 1;
    ctx.drawImage(spr, -w / 2, -w * 0.33, w, w * 0.66);
    ctx.restore();
    if (q < 1 && f.t < 0.05) Paint.splash(ctx, f.from.x, f.from.y, g.u, 3);
    if (f.t > dur + 0.34) this.flying = null;
  },

  // The Huge Shadow event: something vast drifting below.
  shadow(ctx, g, t) {
    const x = g.W * 0.62 + Math.sin(t * 0.3) * g.W * 0.18, y = g.horizon + (g.floor - g.horizon) * 0.5;
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(t * 0.3) > 0 ? -1 : 1, 1);
    ctx.globalAlpha = 0.26; ctx.fillStyle = "#061228";
    Paint.trace(ctx, Paint.blob(0, 0, 110, 34, 2, 20, 0.08)); ctx.fill();
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(160, -36); ctx.lineTo(150, 0); ctx.lineTo(160, 36); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  swirl(ctx, g, t) {
    const x = g.px + g.size + (g.W - 24 - g.px - g.size) * 0.66, y = g.horizon + 20 + (g.floor - 60 - g.horizon) * 0.46;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.34);
    for (let i = 0; i < 4; i++) {
      ctx.rotate((this.reduceMotion ? 0.4 : t * 0.6) + i);
      ctx.strokeStyle = `rgba(150,110,210,${0.4 - i * 0.08})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 30 + i * 22, 0, Math.PI * 1.3); ctx.stroke();
    }
    ctx.restore();
  },

  weather(ctx, g, t, ev) {
    if (!ev) return;
    const { W, H } = g;
    const still = this.reduceMotion;
    if (ev.id === "storm") {
      ctx.fillStyle = "rgba(40,44,60,0.3)"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(220,230,250,0.5)"; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      const n = still ? 30 : 90;
      for (let i = 0; i < n; i++) {
        const x = (Art.h(i, 101) * (W + 100) + (still ? 0 : t * 60)) % (W + 100) - 50;
        const y = (Art.h(i, 102) * H + (still ? 0 : t * (520 + Art.h(i, 103) * 200))) % H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
      }
    } else if (ev.id === "golden") {
      ctx.fillStyle = "rgba(255,190,70,0.14)"; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 24; i++) {
        const span = H - g.horizon;
        const x = Art.h(i, 111) * W, y = g.horizon + (((Art.h(i, 112) * span - (still ? 0 : t * 18 * (0.5 + Art.h(i, 113)))) % span) + span) % span;
        Art.star(ctx, x, y, 2 + Art.h(i, 114) * 3, `rgba(255,236,150,${still ? 0.7 : 0.5 + 0.4 * Math.sin(t * 3 + i)})`);
      }
    } else if (ev.id === "lucky") {
      for (let i = 0; i < 12; i++) {
        const x = (Art.h(i, 121) * W + (still ? 0 : t * 14)) % W, y = Art.h(i, 122) * g.horizon + (still ? 0 : Math.sin(t + i) * 10);
        Paint.wash(ctx, Paint.blob(x, y, 5, 5, i, 8, 0.2), "#6fae44", { layers: 1, edge: 0.4, alpha: 0.7 });
      }
    } else if (ev.id === "comp") {
      const cols = ["#cf4434", "#f0b93f", "#3f8fc4", "#6fae44"];
      const y0 = this.topInset + 6;
      Paint.line(ctx, () => { ctx.moveTo(0, y0); ctx.quadraticCurveTo(W / 2, y0 + 24, W, y0); }, 1.5, Paint.INK, 0.6);
      for (let i = 0; i < Math.ceil(W / 34); i++) {
        const x = i * 34 + 10, q = x / W, y = y0 + 4 * 24 * q * (1 - q);
        Paint.shape(ctx, [[x - 9, y], [x + 9, y], [x, y + 16]], cols[i % 4], 1.2);
      }
    }
  },

  // The reel gauge, on a parchment plate above the control bar. It sits to the
  // right when there is room, because the bobber is reeled in from the right.
  meter(ctx, g, r, t) {
    const R = Math.max(56, Math.min(92, g.W * 0.12));
    const y = g.floor - R * 0.8 - 10;
    const right = g.W - R * 1.55 - 14;
    const x = right - R * 1.5 > g.px + g.size * 0.3 ? right : g.W / 2;
    Paint.gauge(ctx, x, y, R, r, t, this.reduceMotion);
  },

  /* ------------------------------------------------------------ the harbour (Business screen) */

  harbour(ctx, W, H, S, t) {
    const sig = ["dock", "baitshop", "market", "storage", "aquarium", "charter", "hq"].map((id) => Econ.own(S, id)).join("");
    const dpr = ctx.getTransform().a;
    const key = `${W}|${H}|${dpr}|${sig}`;
    if (this.harbourKey !== key || !this.harbourBake) {
      const cv = this.harbourBake || document.createElement("canvas");
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const b = cv.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintHarbour(b, W, H, S);
      this.harbourBake = cv; this.harbourKey = key;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W * dpr, H * dpr); ctx.drawImage(this.harbourBake, 0, 0); ctx.restore();

    const quay = H * 0.56;
    const boats = ["smallboat", "fishingboat", "charter", "trawler", "vessel"].filter((id) => Econ.own(S, id) > 0);
    boats.forEach((id, i) => {
      const size = Math.min(W / 5.5, 44 + i * 12);
      const x = W * 0.1 + i * (W * 0.8 / Math.max(1, boats.length - 1 || 1)) + (boats.length === 1 ? W * 0.3 : 0);
      const y = quay + 56 + (i % 2) * 16 + (this.reduceMotion ? 0 : Math.sin(t * 1.4 + i) * 1.5);
      ctx.save(); ctx.translate(x, y); Art.boat(ctx, id, size, t); ctx.restore();
    });
    const pw = W / 7;
    const spots = [0.1, 0.27, 0.43, 0.6, 0.76, 0.92];
    TRACKS.filter((tr) => tr.helper && Econ.own(S, tr.id) > 0).forEach((tr, i) => {
      Paint.drawPerson(ctx, tr.id, W * spots[i % spots.length] - pw * 0.28, quay + 16, Math.min(44, H * 0.2), false);
    });
  },

  paintHarbour(ctx, W, H, S) {
    const P = Paint, quay = H * 0.56;
    const sky = ctx.createLinearGradient(0, 0, 0, quay); sky.addColorStop(0, "#b9dcea"); sky.addColorStop(1, "#fbecd0");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, quay);
    P.cloud(ctx, W * 0.2, H * 0.12, 0.5, 1); P.cloud(ctx, W * 0.72, H * 0.08, 0.4, 2);
    P.hills(ctx, W, quay - 36, 12, 0.02, 2, "#b8cdb8", { bottom: quay });
    const sea = ctx.createLinearGradient(0, quay, 0, H); sea.addColorStop(0, "#8fcfe0"); sea.addColorStop(1, "#1f6f90");
    ctx.fillStyle = sea; ctx.fillRect(0, quay, W, H - quay);
    const R = P.mulberry(4);
    for (let i = 0; i < 40; i++) { const y = quay + 20 + R() * (H - quay - 20), x = R() * W; ctx.strokeStyle = "rgba(255,255,240,0.3)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16 + R() * 14, y); ctx.stroke(); }
    // the promenade, in planks
    ctx.save(); ctx.beginPath(); ctx.rect(0, quay - 12, W, 34); ctx.clip();
    ctx.fillStyle = "#b8885a"; ctx.fillRect(0, quay - 12, W, 34);
    ctx.globalAlpha = 0.6; ctx.drawImage(P.wood(), 0, 0, 900, 260, 0, quay - 12, W, 34); ctx.globalAlpha = 1;
    ctx.restore();
    P.line(ctx, () => { ctx.moveTo(0, quay - 12); ctx.lineTo(W, quay - 12); ctx.moveTo(0, quay + 22); ctx.lineTo(W, quay + 22); }, 2);
    const plots = ["dock", "baitshop", "market", "storage", "aquarium", "charter", "hq"];
    const pw = W / plots.length;
    plots.forEach((id, i) => this.building(ctx, id, i * pw + pw / 2, quay - 12, Math.min(pw * 0.86, 110), Econ.own(S, id)));
    P.grainOver(ctx, W, H, 0.3);
  },

  building(ctx, id, x, base, w, lv) {
    const P = Paint;
    ctx.save(); ctx.translate(x, base);
    const h = w * 0.8;
    if (!lv) {
      ctx.setLineDash([5, 5]); ctx.strokeStyle = P.rgba(P.INK, 0.45); ctx.lineWidth = 2;
      ctx.strokeRect(-w * 0.4, -h * 0.55, w * 0.8, h * 0.55); ctx.setLineDash([]);
      ctx.fillStyle = P.rgba(P.INK, 0.5); ctx.font = `${Math.round(w * 0.22)}px Caprasimo, Georgia, serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, -h * 0.28);
      ctx.restore(); return;
    }
    const grow = 1 + (lv - 1) * 0.15, bw = w * 0.7 * grow, bh = h * 0.5 * grow;
    const pal = {
      dock: ["#a57a4e", "#6b4a2e"], baitshop: ["#a9c878", "#4e7a3e"], market: ["#f2c04a", "#c84a3a"],
      storage: ["#dfe8ee", "#6ab0e0"], charter: ["#fffaf0", "#2aa38a"], hq: ["#f4f0e6", "#2f6f8a"], aquarium: ["#bfe8ff", "#2f86b4"],
    }[id];
    if (id === "dock") {
      P.shape(ctx, [[-bw / 2, -8], [bw / 2, -8], [bw / 2, 0], [-bw / 2, 0]], pal[0], 1.6);
      for (let i = 0; i < 4; i++) P.shape(ctx, [[-bw / 2 + i * bw / 3.2, -8], [-bw / 2 + i * bw / 3.2 + 5, -8], [-bw / 2 + i * bw / 3.2 + 5, 36], [-bw / 2 + i * bw / 3.2, 36]], pal[1], 1.2);
      if (lv >= 2) P.line(ctx, () => { ctx.moveTo(bw * 0.3, 0); ctx.lineTo(bw * 0.3, -bh * 1.3); ctx.lineTo(bw * 0.05, -bh * 1.1); }, 3, "#e0a82a");
    } else {
      const hh = id === "hq" ? bh * 1.6 : bh;
      P.shape(ctx, [[-bw / 2, 0], [-bw / 2, -hh], [bw / 2, -hh], [bw / 2, 0]], pal[0], 1.8);
      P.shape(ctx, [[-bw / 2 - 5, -hh], [0, -hh - bh * 0.45], [bw / 2 + 5, -hh]], pal[1], 1.8);
      P.shape(ctx, [[-bw * 0.1, 0], [-bw * 0.1, -hh * 0.45], [bw * 0.1, -hh * 0.45], [bw * 0.1, 0]], "#6a4526", 1.2);
      for (const wx of [-0.38, 0.2]) P.shape(ctx, [[bw * wx, -hh * 0.53], [bw * wx, -hh * 0.75], [bw * (wx + 0.18), -hh * 0.75], [bw * (wx + 0.18), -hh * 0.53]], "#9ad4f0", 1);
      if (id === "market") for (let i = 0; i < 5; i++) P.wash(ctx, [[-bw / 2 + i * bw / 5, -hh * 0.98], [-bw / 2 + (i + 1) * bw / 5, -hh * 0.98], [-bw / 2 + (i + 1) * bw / 5, -hh * 0.84], [-bw / 2 + i * bw / 5, -hh * 0.84]], i % 2 ? "#fff" : "#c84a3a", { layers: 1, edge: 0 });
      if (id === "hq") { P.line(ctx, () => { ctx.moveTo(0, -hh - bh * 0.45); ctx.lineTo(0, -hh - bh * 0.45 - 20); }, 2, "#8a6412"); P.shape(ctx, [[1, -hh - bh * 0.45 - 20], [16, -hh - bh * 0.45 - 15], [1, -hh - bh * 0.45 - 10]], "#cf4434", 1); }
      if (id === "aquarium") P.shape(ctx, [[-9, -hh - bh * 0.16], [6, -hh - bh * 0.22], [14, -hh - bh * 0.28], [14, -hh - bh * 0.04], [6, -hh - bh * 0.1]], "#f0b93f", 1.2);
    }
    for (let i = 0; i < lv; i++) { Art.ellipse(ctx, 8 - (lv - 1) * 5 + i * 10, 16, 3.5, 3.5); ctx.fillStyle = "#f0b93f"; ctx.fill(); ctx.strokeStyle = P.INK; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  },
};
