// Art: every catch, character and boat, painted with canvas paths.
//
// One pen for everything: a dark outline taken from each thing's own base
// colour, a soft top-to-bottom body gradient, and a single white highlight.
// Each species varies by BODY PLAN (shape, fins, snout, tail), not just
// colour, so a pike never reads as a recoloured trout.
//
// drawCatch() draws centred on (0,0) inside a box `w` wide and ~0.62w tall.
// sprite() caches a drawing into an offscreen canvas for the DOM (journal,
// catch card, haul) in three modes: full colour, silhouette, golden.

// Lighten (+) or darken (−) a #rrggbb colour by a FRACTION toward white or
// black. (GK.util.shade adds an absolute amount per channel, which is a
// different scale — a fraction passed to it silently produces a broken string.)
function shade(hex, amt) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  if (!isFinite(n)) return hex;
  const mix = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Body plans. h = height/width, len = body length scale, nose, tail, dorsal.
const SHAPES = {
  slim:     { h: 0.24, len: 1.0, nose: 0.02, tail: "fork", dorsal: "small" },
  perch:    { h: 0.34, len: 0.95, nose: 0.05, tail: "fork", dorsal: "spiky" },
  round:    { h: 0.5, len: 0.8, nose: 0.02, tail: "round", dorsal: "arc" },
  deep:     { h: 0.42, len: 0.92, nose: 0.06, tail: "fork", dorsal: "long" },
  torpedo:  { h: 0.28, len: 1.0, nose: 0.04, tail: "square", dorsal: "arc" },
  bass:     { h: 0.34, len: 0.98, nose: -0.02, tail: "round", dorsal: "spiky" },
  cat:      { h: 0.28, len: 1.02, nose: 0.02, tail: "round", dorsal: "small", flatHead: true },
  pike:     { h: 0.2, len: 1.06, nose: 0.03, tail: "fork", dorsal: "rear", snout: 0.12 },
  tuna:     { h: 0.36, len: 0.98, nose: 0.02, tail: "moon", dorsal: "tuna" },
  flat:     { h: 0.2, len: 1.02, nose: -0.04, tail: "round", dorsal: "long", flatHead: true },
  puffer:   { h: 0.62, len: 0.72, nose: 0.02, tail: "round", dorsal: "small" },
  mahi:     { h: 0.36, len: 1.02, nose: -0.08, tail: "fork", dorsal: "full", blunt: true },
  sword:    { h: 0.22, len: 0.9, nose: 0.0, tail: "moon", dorsal: "tall", bill: 0.3 },
  sturgeon: { h: 0.2, len: 1.04, nose: 0.06, tail: "shark", dorsal: "rear", snout: 0.08 },
  ancient:  { h: 0.36, len: 0.94, nose: 0.02, tail: "lobe", dorsal: "lobes" },
};

const Art = {
  cache: new Map(),

  /* ------------------------------------------------------------ helpers */

  pen(w) { return Math.max(1.2, w * 0.018); },

  outline(ctx, base, w) {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = shade(base, -0.45);
    ctx.lineWidth = this.pen(w);
    ctx.stroke();
  },

  ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  },

  eye(ctx, x, y, r, opts = {}) {
    this.ellipse(ctx, x, y, r, r);
    ctx.fillStyle = opts.red ? "#ffd9cc" : "#fffdf5"; ctx.fill();
    ctx.lineWidth = Math.max(0.8, r * 0.28); ctx.strokeStyle = "rgba(20,24,30,0.7)"; ctx.stroke();
    this.ellipse(ctx, x - r * 0.12, y + r * 0.05, r * 0.58, r * 0.58);
    ctx.fillStyle = opts.red ? "#b3262a" : opts.pink ? "#d6607a" : "#1b1f26"; ctx.fill();
    this.ellipse(ctx, x - r * 0.35, y - r * 0.3, r * 0.22, r * 0.22);
    ctx.fillStyle = "#fff"; ctx.fill();
  },

  // A stable pseudo-random number for pattern placement.
  h(i, k = 1) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); },

  /* ------------------------------------------------------------ entry points */

  drawCatch(ctx, c, w, t = 0) {
    const a = c.art;
    ctx.save();
    switch (a.k) {
      case "fish": this.fish(ctx, a, w, t); break;
      case "boot": this.boot(ctx, w); break;
      case "duck": this.duck(ctx, w); break;
      case "rod": this.lostRod(ctx, w); break;
      case "key": this.key(ctx, w); break;
      case "gnome": this.gnome(ctx, w); break;
      case "squid": this.squid(ctx, a, w, t); break;
      case "crab": this.crab(ctx, a, w); break;
      case "lobster": this.lobster(ctx, a, w); break;
      case "bottle": this.bottle(ctx, w); break;
      case "turtle": this.turtle(ctx, a, w); break;
      case "chest": this.chest(ctx, w); break;
      case "coin": this.coin(ctx, w); break;
      case "fossil": this.fossil(ctx, w); break;
      case "relic": this.relic(ctx, w, t); break;
      case "jelly": this.jelly(ctx, a, w, t); break;
      default: this.fish(ctx, { sh: "torpedo", c: ["#888", "#ddd", "#777"] }, w);
    }
    ctx.restore();
  },

  // mode: "full" | "sil" | "gold"
  sprite(c, cssW, mode = "full") {
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const key = `${c.id}|${cssW}|${mode}|${dpr}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const cssH = Math.round(cssW * 0.66);
    const cv = document.createElement("canvas");
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, cssW / 2 * dpr, cssH / 2 * dpr);
    this.drawCatch(ctx, c, cssW * 0.9);
    if (mode === "sil") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#26384a";
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else if (mode === "gold") {
      this.gildCanvas(ctx, cv);
    }
    this.cache.set(key, cv);
    return cv;
  },

  gildCanvas(ctx, cv) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, "rgba(255,226,120,0.62)");
    g.addColorStop(0.5, "rgba(255,196,40,0.5)");
    g.addColorStop(1, "rgba(255,240,170,0.62)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = "source-over";
    const s = cv.width / 100;
    for (const [x, y, r] of [[0.28, 0.3, 3], [0.62, 0.22, 2.2], [0.74, 0.62, 2.6]]) this.star(ctx, cv.width * x, cv.height * y, r * s, "#fffbe0");
    ctx.restore();
  },

  star(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.28 : r, ang = (i / 8) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  },

  /* ------------------------------------------------------------ fish */

  fish(ctx, a, w, t = 0) {
    if (a.sh === "eel") return this.eel(ctx, a, w, t);
    if (a.sh === "sunfish") return this.sunfish(ctx, a, w);
    if (a.sh === "angler") return this.angler(ctx, a, w, t);
    const sh = SHAPES[a.sh] || SHAPES.torpedo;
    const [back, belly, fin] = a.c;
    const L = w * 0.74 * sh.len, H = w * sh.h;
    const bill = sh.bill ? w * sh.bill : 0;
    ctx.translate(bill * 0.35 - w * 0.04, 0);
    const nx = -L / 2, tx = L / 2;
    const ny = sh.nose * H;

    // --- behind the body: tail, dorsal, anal, pelvic fins
    ctx.fillStyle = fin;
    this.tail(ctx, sh.tail, tx, H, w, fin);
    this.dorsal(ctx, sh.dorsal, L, H, w, fin, a);
    // anal + pelvic
    ctx.beginPath();
    ctx.moveTo(L * 0.12, H * 0.34); ctx.quadraticCurveTo(L * 0.26, H * 0.66, L * 0.36, H * 0.24); ctx.closePath();
    ctx.fillStyle = fin; ctx.fill(); this.outline(ctx, fin, w * 0.7);
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, H * 0.42); ctx.quadraticCurveTo(-L * 0.06, H * 0.78, L * 0.02, H * 0.4); ctx.closePath();
    ctx.fill(); this.outline(ctx, fin, w * 0.7);

    if (a.sh === "puffer") {
      // spines standing out all round the balloon
      ctx.fillStyle = shade(back, -0.25);
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2;
        const rx = L * 0.46, ry = H * 0.5;
        const x = Math.cos(ang) * rx, y = Math.sin(ang) * ry;
        const nx2 = Math.cos(ang), ny2 = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(x - ny2 * w * 0.018, y + nx2 * w * 0.018);
        ctx.lineTo(x + nx2 * w * 0.06, y + ny2 * w * 0.06);
        ctx.lineTo(x + ny2 * w * 0.018, y - nx2 * w * 0.018);
        ctx.fill();
      }
    }

    // --- body
    const body = () => {
      ctx.beginPath();
      if (sh.blunt) {
        ctx.moveTo(nx + L * 0.02, ny);
        ctx.bezierCurveTo(nx - L * 0.02, -H * 0.7, -L * 0.2, -H * 0.62, L * 0.16, -H * 0.4);
      } else {
        const sn = sh.snout ? L * sh.snout : 0;
        ctx.moveTo(nx - sn, ny);
        ctx.bezierCurveTo(nx + L * 0.06, -H * (sh.flatHead ? 0.34 : 0.56), -L * 0.12, -H * 0.62, L * 0.16, -H * 0.42);
      }
      ctx.quadraticCurveTo(L * 0.4, -H * 0.2, tx, -H * 0.1);
      ctx.lineTo(tx, H * 0.1);
      ctx.quadraticCurveTo(L * 0.4, H * 0.2, L * 0.16, H * 0.4);
      const sn = sh.snout ? L * sh.snout : 0;
      ctx.bezierCurveTo(-L * 0.12, H * 0.6, nx + L * 0.04, H * 0.5, sh.blunt ? nx + L * 0.02 : nx - sn, ny);
      ctx.closePath();
    };
    body();
    const g = ctx.createLinearGradient(0, -H * 0.55, 0, H * 0.5);
    g.addColorStop(0, shade(back, -0.08)); g.addColorStop(0.5, back); g.addColorStop(0.78, belly); g.addColorStop(1, belly);
    ctx.fillStyle = g; ctx.fill();

    // --- patterns, clipped to the body
    ctx.save();
    body(); ctx.clip();
    this.patterns(ctx, a, L, H, w);
    // soft highlight along the back
    this.ellipse(ctx, -L * 0.05, -H * 0.24, L * 0.3, H * 0.09, -0.08);
    ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
    ctx.restore();
    body(); this.outline(ctx, back, w);

    // gill arc
    ctx.beginPath();
    ctx.arc(nx + L * 0.24, ny, H * 0.3, -1.1, 1.1);
    ctx.strokeStyle = shade(back, -0.4); ctx.lineWidth = this.pen(w) * 0.8; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;

    // pectoral fin, over the body
    ctx.beginPath();
    ctx.moveTo(nx + L * 0.3, H * 0.06);
    ctx.quadraticCurveTo(nx + L * 0.46, H * 0.02, nx + L * 0.44, H * 0.3);
    ctx.quadraticCurveTo(nx + L * 0.36, H * 0.24, nx + L * 0.3, H * 0.06);
    ctx.fillStyle = shade(fin, 0.08); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    this.outline(ctx, fin, w * 0.6);

    // bill / snout extras
    if (bill) {
      ctx.beginPath();
      ctx.moveTo(nx + L * 0.02, ny - H * 0.08);
      ctx.lineTo(nx - bill, ny + H * 0.02);
      ctx.lineTo(nx + L * 0.02, ny + H * 0.1);
      ctx.closePath();
      ctx.fillStyle = shade(back, -0.1); ctx.fill(); this.outline(ctx, back, w * 0.8);
    }

    // mouth
    ctx.beginPath();
    const mx = (sh.blunt ? nx + L * 0.03 : nx - (sh.snout ? L * sh.snout : 0));
    if (a.bigMouth) {
      ctx.moveTo(mx, ny + H * 0.02); ctx.quadraticCurveTo(nx + L * 0.1, ny + H * 0.2, nx + L * 0.2, ny + H * 0.06);
    } else {
      ctx.moveTo(mx + L * 0.01, ny + H * 0.03); ctx.lineTo(mx + L * 0.07, ny + H * 0.06);
    }
    ctx.strokeStyle = shade(back, -0.5); ctx.lineWidth = this.pen(w) * 0.9; ctx.stroke();
    if (a.teeth) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 4; i++) {
        const x = mx + L * (0.03 + i * 0.035);
        ctx.beginPath(); ctx.moveTo(x, ny + H * 0.04); ctx.lineTo(x + L * 0.012, ny + H * 0.13); ctx.lineTo(x + L * 0.024, ny + H * 0.05); ctx.fill();
      }
    }

    // whiskers
    if (a.whiskers) {
      ctx.strokeStyle = shade(back, -0.35); ctx.lineWidth = this.pen(w) * 0.7;
      for (const [dx, dy] of [[-0.16, 0.34], [-0.2, 0.2], [-0.1, 0.42]]) {
        ctx.beginPath(); ctx.moveTo(mx + L * 0.04, ny + H * 0.05);
        ctx.quadraticCurveTo(mx + L * dx * 0.5, ny + H * dy * 0.6, mx + L * dx, ny + H * dy); ctx.stroke();
      }
    }

    // eye
    const er = w * 0.034 * (a.bigEye ? 1.45 : 1) * (sh.h > 0.45 ? 1.15 : 1);
    this.eye(ctx, nx + L * (sh.snout ? 0.1 : 0.14), ny - H * 0.14, er, { red: a.redEye, pink: a.pinkEye });

    if (a.crown) this.crown(ctx, nx + L * 0.2, -H * 0.62, w * 0.1);
    if (a.shine) {
      this.star(ctx, -L * 0.1, -H * 0.18, w * 0.03, "rgba(255,255,255,0.9)");
      this.star(ctx, L * 0.22, H * 0.05, w * 0.022, "rgba(255,255,255,0.8)");
    }
    if (a.glow) {
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.6);
      gg.addColorStop(0, a.glow + "44"); gg.addColorStop(1, a.glow + "00");
      ctx.fillStyle = gg; this.ellipse(ctx, 0, 0, L * 0.6, H * 1.1); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  },

  tail(ctx, kind, tx, H, w, fin) {
    ctx.beginPath();
    const s = w * 0.2;
    switch (kind) {
      case "fork":
        ctx.moveTo(tx - s * 0.1, 0);
        ctx.quadraticCurveTo(tx + s * 0.35, -H * 0.2, tx + s * 0.8, -H * 0.55 - s * 0.2);
        ctx.quadraticCurveTo(tx + s * 0.55, 0, tx + s * 0.8, H * 0.55 + s * 0.2);
        ctx.quadraticCurveTo(tx + s * 0.35, H * 0.2, tx - s * 0.1, 0);
        break;
      case "moon":
        ctx.moveTo(tx - s * 0.1, 0);
        ctx.quadraticCurveTo(tx + s * 0.5, -H * 0.3, tx + s * 0.95, -H * 0.8 - s * 0.3);
        ctx.quadraticCurveTo(tx + s * 0.45, 0, tx + s * 0.95, H * 0.8 + s * 0.3);
        ctx.quadraticCurveTo(tx + s * 0.5, H * 0.3, tx - s * 0.1, 0);
        break;
      case "shark":
        ctx.moveTo(tx - s * 0.1, -H * 0.1);
        ctx.quadraticCurveTo(tx + s * 0.5, -H * 0.4, tx + s * 1.0, -H * 0.9 - s * 0.2);
        ctx.quadraticCurveTo(tx + s * 0.6, -H * 0.1, tx + s * 0.55, H * 0.4);
        ctx.quadraticCurveTo(tx + s * 0.3, H * 0.2, tx - s * 0.1, H * 0.1);
        break;
      case "lobe":
        ctx.moveTo(tx - s * 0.1, 0);
        ctx.quadraticCurveTo(tx + s * 0.4, -H * 0.55, tx + s * 0.75, -H * 0.3);
        ctx.quadraticCurveTo(tx + s * 1.0, 0, tx + s * 0.75, H * 0.3);
        ctx.quadraticCurveTo(tx + s * 0.4, H * 0.55, tx - s * 0.1, 0);
        break;
      case "square":
        ctx.moveTo(tx - s * 0.1, 0);
        ctx.quadraticCurveTo(tx + s * 0.3, -H * 0.3, tx + s * 0.7, -H * 0.48 - s * 0.1);
        ctx.quadraticCurveTo(tx + s * 0.6, 0, tx + s * 0.7, H * 0.48 + s * 0.1);
        ctx.quadraticCurveTo(tx + s * 0.3, H * 0.3, tx - s * 0.1, 0);
        break;
      default: // round
        ctx.moveTo(tx - s * 0.1, 0);
        ctx.quadraticCurveTo(tx + s * 0.2, -H * 0.5, tx + s * 0.62, -H * 0.36);
        ctx.quadraticCurveTo(tx + s * 0.85, 0, tx + s * 0.62, H * 0.36);
        ctx.quadraticCurveTo(tx + s * 0.2, H * 0.5, tx - s * 0.1, 0);
    }
    ctx.closePath();
    ctx.fillStyle = fin; ctx.fill(); this.outline(ctx, fin, w * 0.8);
    // fin rays
    ctx.strokeStyle = shade(fin, -0.2); ctx.lineWidth = this.pen(w) * 0.5; ctx.globalAlpha = 0.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx + s * 0.6, i * H * 0.16); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  dorsal(ctx, kind, L, H, w, fin, a) {
    ctx.beginPath();
    const top = -H * 0.46;
    switch (kind) {
      case "spiky": {
        ctx.moveTo(-L * 0.22, top + H * 0.08);
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const x = -L * 0.2 + (i / n) * L * 0.34;
          ctx.lineTo(x, top - H * (0.38 - i * 0.03));
          ctx.lineTo(x + L * 0.028, top - H * 0.08);
        }
        ctx.lineTo(L * 0.3, -H * 0.3);
        ctx.quadraticCurveTo(L * 0.38, -H * 0.62, L * 0.2, -H * 0.3);
        break;
      }
      case "long":
        ctx.moveTo(-L * 0.18, top + H * 0.04);
        ctx.quadraticCurveTo(-L * 0.08, top - H * 0.34, L * 0.08, top - H * 0.2);
        ctx.lineTo(L * 0.36, -H * 0.26); ctx.lineTo(L * 0.3, -H * 0.2);
        break;
      case "full":
        ctx.moveTo(-L * 0.42, -H * 0.5);
        ctx.quadraticCurveTo(-L * 0.3, -H * 0.9, L * 0.05, -H * 0.7);
        ctx.quadraticCurveTo(L * 0.35, -H * 0.5, L * 0.46, -H * 0.18); ctx.lineTo(L * 0.3, -H * 0.2);
        break;
      case "tall":
        ctx.moveTo(-L * 0.3, -H * 0.4);
        ctx.quadraticCurveTo(-L * 0.24, -H * (a.sail ? 2.2 : 1.35), -L * 0.12, -H * (a.sail ? 1.8 : 1.1));
        if (a.sail) ctx.quadraticCurveTo(L * 0.2, -H * 1.1, L * 0.3, -H * 0.3);
        else ctx.lineTo(-L * 0.02, -H * 0.4);
        break;
      case "tuna":
        ctx.moveTo(-L * 0.12, top);
        ctx.quadraticCurveTo(-L * 0.04, top - H * 0.42, L * 0.06, top - H * 0.02);
        ctx.moveTo(L * 0.16, -H * 0.34);
        ctx.lineTo(L * 0.22, -H * 0.66); ctx.lineTo(L * 0.28, -H * 0.28);
        break;
      case "rear":
        ctx.moveTo(L * 0.14, -H * 0.36);
        ctx.quadraticCurveTo(L * 0.3, -H * 0.9, L * 0.4, -H * 0.2);
        break;
      case "lobes":
        this.ellipse(ctx, -L * 0.05, -H * 0.62, L * 0.08, H * 0.2, -0.4);
        ctx.moveTo(L * 0.3, -H * 0.3);
        ctx.ellipse(L * 0.25, -H * 0.42, L * 0.07, H * 0.16, 0.5, 0, Math.PI * 2);
        break;
      case "small":
        ctx.moveTo(-L * 0.04, top + H * 0.02);
        ctx.quadraticCurveTo(L * 0.04, top - H * 0.34, L * 0.16, -H * 0.36);
        break;
      default: // arc
        ctx.moveTo(-L * 0.14, top + H * 0.02);
        ctx.quadraticCurveTo(-L * 0.02, top - H * 0.45, L * 0.12, -H * 0.38);
    }
    ctx.closePath();
    ctx.fillStyle = a.fancyFins ? "rgba(255,255,255,0.8)" : fin;
    ctx.fill(); this.outline(ctx, fin, w * 0.7);
    if (a.finlets) {
      ctx.fillStyle = a.finlets;
      for (let i = 0; i < 5; i++) {
        const x = L * (0.3 + i * 0.04);
        ctx.beginPath(); ctx.moveTo(x, -H * 0.2); ctx.lineTo(x + L * 0.02, -H * 0.3); ctx.lineTo(x + L * 0.03, -H * 0.17); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, H * 0.2); ctx.lineTo(x + L * 0.02, H * 0.3); ctx.lineTo(x + L * 0.03, H * 0.17); ctx.fill();
      }
    }
  },

  patterns(ctx, a, L, H, w) {
    const back = a.c[0];
    if (a.pinkBelly) {
      ctx.fillStyle = "rgba(240,150,150,0.35)";
      this.ellipse(ctx, 0, H * 0.25, L * 0.45, H * 0.2); ctx.fill();
    }
    if (a.bars) {
      ctx.fillStyle = a.bars; ctx.globalAlpha = 0.55;
      for (let i = 0; i < 6; i++) {
        const x = -L * 0.28 + i * L * 0.13;
        ctx.beginPath();
        ctx.moveTo(x, -H * 0.6); ctx.lineTo(x + L * 0.05, -H * 0.6); ctx.lineTo(x + L * 0.035, H * 0.15); ctx.lineTo(x - L * 0.01, H * 0.15);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (a.stripe) {
      ctx.fillStyle = a.stripe; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(-L * 0.4, -H * 0.02);
      ctx.quadraticCurveTo(0, -H * 0.1, L * 0.5, -H * 0.02);
      ctx.lineTo(L * 0.5, H * 0.06);
      ctx.quadraticCurveTo(0, 0.02 * H, -L * 0.4, H * 0.08);
      ctx.fill(); ctx.globalAlpha = 1;
    }
    if (a.wavy) {
      ctx.strokeStyle = a.wavy; ctx.lineWidth = this.pen(w) * 1.1; ctx.globalAlpha = 0.8;
      for (let i = 0; i < 7; i++) {
        const x = -L * 0.25 + i * L * 0.1;
        ctx.beginPath(); ctx.moveTo(x, -H * 0.55);
        ctx.quadraticCurveTo(x + L * 0.05, -H * 0.3, x, -H * 0.05); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (a.scales) {
      ctx.strokeStyle = shade(back, -0.28); ctx.lineWidth = this.pen(w) * 0.55; ctx.globalAlpha = 0.45;
      const r = w * 0.04;
      for (let row = -3; row <= 3; row++) {
        for (let col = -6; col <= 6; col++) {
          const x = col * r * 1.5 + (row % 2 ? r * 0.75 : 0), y = row * r * 1.1;
          ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (a.spots) {
      ctx.fillStyle = a.spots;
      for (let i = 0; i < 22; i++) {
        const x = -L * 0.35 + this.h(i, 1) * L * 0.85, y = -H * 0.45 + this.h(i, 2) * H * 0.6;
        this.ellipse(ctx, x, y, w * 0.012 + this.h(i, 3) * w * 0.01, w * 0.01 + this.h(i, 3) * w * 0.008); ctx.fill();
      }
    }
    if (a.spot) {
      ctx.fillStyle = a.spot;
      this.ellipse(ctx, -L * 0.22, -H * 0.02, w * 0.035, w * 0.03); ctx.fill();
    }
    if (a.patches) {
      ctx.fillStyle = a.patches;
      for (const [x, y, rx, ry] of [[-0.25, -0.25, 0.14, 0.2], [0.05, -0.32, 0.12, 0.16], [0.28, 0.0, 0.1, 0.18], [-0.05, 0.12, 0.08, 0.1]]) {
        this.ellipse(ctx, L * x, H * y, L * rx, H * ry, 0.3); ctx.fill();
      }
    }
    if (a.plates) {
      ctx.fillStyle = a.plates;
      for (let i = 0; i < 9; i++) {
        const x = -L * 0.34 + i * L * 0.095;
        ctx.beginPath(); ctx.moveTo(x, -H * 0.36); ctx.lineTo(x + L * 0.03, -H * 0.5); ctx.lineTo(x + L * 0.06, -H * 0.36); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, H * 0.02); ctx.lineTo(x + L * 0.03, -H * 0.06); ctx.lineTo(x + L * 0.06, H * 0.02); ctx.fill();
      }
    }
    if (a.glowDots) {
      for (let i = 0; i < 9; i++) {
        this.ellipse(ctx, -L * 0.3 + i * L * 0.08, H * 0.22, w * 0.014, w * 0.014);
        ctx.fillStyle = a.glow; ctx.fill();
      }
    }
  },

  crown(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, 0); ctx.lineTo(-s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.25, -s * 0.22);
    ctx.lineTo(0, -s * 0.62); ctx.lineTo(s * 0.25, -s * 0.22); ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = "#f6c431"; ctx.fill(); this.outline(ctx, "#f6c431", s * 5);
    ctx.fillStyle = "#e0463a"; this.ellipse(ctx, 0, -s * 0.16, s * 0.08, s * 0.08); ctx.fill();
    ctx.restore();
  },

  eel(ctx, a, w, t) {
    const [back, belly, fin] = a.c;
    const n = 26, L = w * 0.9, amp = w * 0.05;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = -L / 2 + u * L;
      const y = Math.sin(u * 5.5 + t * 4) * amp * (0.3 + u * 0.7);
      const th = w * 0.1 * (u < 0.1 ? 0.65 + u * 3.5 : 1 - Math.pow(u, 2.2) * 0.85);
      pts.push([x, y, th]);
    }
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y, th], i) => (i ? ctx.lineTo(x, y - th) : ctx.moveTo(x, y - th)));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + pts[i][2]);
      ctx.closePath();
    };
    // fin ribbon
    ctx.beginPath();
    pts.forEach(([x, y, th], i) => { if (i > 8) ctx.lineTo(x, y - th - w * 0.03 * (i / n)); else if (i === 8) ctx.moveTo(x, y - th); });
    for (let i = pts.length - 1; i >= 8; i--) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.fillStyle = fin; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
    path();
    const g = ctx.createLinearGradient(0, -w * 0.08, 0, w * 0.08);
    g.addColorStop(0, back); g.addColorStop(1, belly);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, back, w);
    if (a.glow) {
      for (let i = 4; i < n; i += 3) { this.ellipse(ctx, pts[i][0], pts[i][1], w * 0.012, w * 0.012); ctx.fillStyle = a.glow; ctx.fill(); }
    }
    this.eye(ctx, pts[1][0] + w * 0.035, pts[1][1] - w * 0.025, w * 0.03);
    ctx.beginPath(); ctx.moveTo(pts[0][0] + w * 0.005, pts[0][1] + w * 0.02); ctx.lineTo(pts[0][0] + w * 0.05, pts[0][1] + w * 0.03);
    ctx.strokeStyle = shade(back, -0.5); ctx.lineWidth = this.pen(w) * 0.8; ctx.stroke();
  },

  sunfish(ctx, a, w) {
    const [back, belly, fin] = a.c;
    const R = w * 0.3;
    ctx.fillStyle = fin;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(R * 0.1, dir * R * 0.7);
      ctx.quadraticCurveTo(R * 0.4, dir * R * 1.9, R * 0.75, dir * R * 1.75);
      ctx.quadraticCurveTo(R * 0.7, dir * R * 1.0, R * 0.55, dir * R * 0.6);
      ctx.closePath(); ctx.fill(); this.outline(ctx, fin, w);
    }
    this.ellipse(ctx, 0, 0, R * 1.05, R * 0.95);
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, back); g.addColorStop(1, belly);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, back, w);
    // the clavus — the "tail that gave up"
    ctx.beginPath();
    ctx.moveTo(R * 0.85, -R * 0.55);
    for (let i = 0; i <= 5; i++) ctx.quadraticCurveTo(R * 1.25, -R * 0.55 + (i + 0.5) * R * 0.22, R * 0.9, -R * 0.55 + (i + 1) * R * 0.22);
    ctx.fillStyle = fin; ctx.fill(); this.outline(ctx, fin, w);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 8; i++) { this.ellipse(ctx, -R * 0.4 + this.h(i) * R, -R * 0.5 + this.h(i, 2) * R, R * 0.07, R * 0.05); ctx.fill(); }
    this.eye(ctx, -R * 0.62, -R * 0.2, w * 0.035);
    ctx.beginPath(); ctx.arc(-R * 0.98, R * 0.05, R * 0.06, 0, Math.PI * 2); ctx.fillStyle = shade(back, -0.4); ctx.fill();
    this.crown(ctx, -R * 0.2, -R * 1.02, w * 0.1);
  },

  angler(ctx, a, w, t) {
    const [back, belly, fin] = a.c;
    const R = w * 0.26;
    // tail
    ctx.beginPath();
    ctx.moveTo(R * 0.8, 0); ctx.lineTo(R * 1.6, -R * 0.5); ctx.lineTo(R * 1.45, 0); ctx.lineTo(R * 1.6, R * 0.5); ctx.closePath();
    ctx.fillStyle = fin; ctx.fill(); this.outline(ctx, fin, w);
    this.ellipse(ctx, 0, 0, R * 1.05, R * 0.9);
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R * 1.1);
    g.addColorStop(0, shade(back, 0.2)); g.addColorStop(1, back);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, back, w);
    // jaw
    ctx.beginPath();
    ctx.moveTo(-R * 1.0, -R * 0.05);
    ctx.quadraticCurveTo(-R * 0.3, R * 0.2, R * 0.2, R * 0.05);
    ctx.quadraticCurveTo(-R * 0.3, R * 0.75, -R * 1.1, R * 0.35);
    ctx.closePath();
    ctx.fillStyle = "#1a1016"; ctx.fill();
    ctx.fillStyle = "#f2efe6";
    for (let i = 0; i < 6; i++) {
      const x = -R * 0.95 + i * R * 0.2;
      ctx.beginPath(); ctx.moveTo(x, -R * 0.02 + i * R * 0.02); ctx.lineTo(x + R * 0.06, R * 0.2); ctx.lineTo(x + R * 0.12, R * 0.02 + i * R * 0.02); ctx.fill();
    }
    // lure
    const lx = -R * 1.35, ly = -R * 1.25 + Math.sin(t * 3) * R * 0.08;
    ctx.beginPath(); ctx.moveTo(-R * 0.3, -R * 0.8); ctx.quadraticCurveTo(-R * 0.6, -R * 1.7, lx, ly);
    ctx.strokeStyle = shade(back, -0.2); ctx.lineWidth = this.pen(w) * 1.2; ctx.stroke();
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.45);
    lg.addColorStop(0, a.lure); lg.addColorStop(0.3, a.lure + "88"); lg.addColorStop(1, a.lure + "00");
    ctx.fillStyle = lg; this.ellipse(ctx, lx, ly, R * 0.45, R * 0.45); ctx.fill();
    ctx.fillStyle = "#fff"; this.ellipse(ctx, lx, ly, R * 0.08, R * 0.08); ctx.fill();
    this.eye(ctx, -R * 0.35, -R * 0.35, w * 0.028);
  },

  /* ------------------------------------------------------------ oddities & creatures */

  boot(ctx, w) {
    const s = w / 100;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -26 * s); ctx.lineTo(12 * s, -26 * s); ctx.lineTo(14 * s, 4 * s);
    ctx.quadraticCurveTo(36 * s, 6 * s, 38 * s, 18 * s); ctx.lineTo(38 * s, 24 * s);
    ctx.lineTo(-14 * s, 24 * s); ctx.lineTo(-12 * s, 0); ctx.closePath();
    ctx.fillStyle = "#6b4a2e"; ctx.fill(); this.outline(ctx, "#6b4a2e", w);
    ctx.fillStyle = "#3b2a1c"; ctx.fillRect(-15 * s, 19 * s, 54 * s, 6 * s);
    ctx.strokeStyle = "#e8d8b0"; ctx.lineWidth = 1.6 * s;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, (-16 + i * 7) * s); ctx.lineTo(12 * s, (-14 + i * 7) * s); ctx.stroke(); }
    // weed
    ctx.strokeStyle = "#4f9a4a"; ctx.lineWidth = 2.4 * s;
    ctx.beginPath(); ctx.moveTo(-6 * s, -26 * s); ctx.quadraticCurveTo(-18 * s, -36 * s, -10 * s, -44 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4 * s, -26 * s); ctx.quadraticCurveTo(8 * s, -38 * s, 18 * s, -40 * s); ctx.stroke();
    // a drip
    ctx.fillStyle = "#9fdcf0"; this.ellipse(ctx, 30 * s, 32 * s, 2.5 * s, 3.5 * s); ctx.fill();
  },

  duck(ctx, w) {
    const s = w / 100;
    this.ellipse(ctx, 2 * s, 12 * s, 30 * s, 17 * s); ctx.fillStyle = "#ffd12e"; ctx.fill(); this.outline(ctx, "#f2b705", w);
    ctx.beginPath(); ctx.moveTo(28 * s, 8 * s); ctx.quadraticCurveTo(40 * s, -6 * s, 32 * s, 2 * s); ctx.fill(); this.outline(ctx, "#f2b705", w);
    this.ellipse(ctx, -14 * s, -14 * s, 16 * s, 15 * s); ctx.fillStyle = "#ffd12e"; ctx.fill(); this.outline(ctx, "#f2b705", w);
    ctx.beginPath(); ctx.moveTo(-28 * s, -12 * s); ctx.quadraticCurveTo(-44 * s, -10 * s, -40 * s, -4 * s); ctx.quadraticCurveTo(-32 * s, -4 * s, -26 * s, -6 * s);
    ctx.fillStyle = "#ff7a1a"; ctx.fill(); this.outline(ctx, "#ff7a1a", w);
    this.eye(ctx, -18 * s, -18 * s, 3.5 * s);
    ctx.beginPath(); ctx.arc(4 * s, 8 * s, 12 * s, 0.2, 1.6); ctx.strokeStyle = "#f2b705"; ctx.lineWidth = 2 * s; ctx.stroke();
  },

  lostRod(ctx, w) {
    const s = w / 100;
    ctx.save(); ctx.rotate(-0.45);
    ctx.fillStyle = "#1c6ab0"; ctx.fillRect(-44 * s, -2.2 * s, 88 * s, 4.4 * s);
    ctx.fillStyle = "#2b2b2b"; ctx.fillRect(-44 * s, -3.6 * s, 22 * s, 7.2 * s);
    ctx.fillStyle = "#e8b43a";
    for (const x of [-10, 10, 28]) { this.ellipse(ctx, x * s, -4 * s, 2 * s, 2 * s); ctx.fill(); }
    this.ellipse(ctx, -16 * s, 7 * s, 7 * s, 7 * s); ctx.fillStyle = "#c9ccd2"; ctx.fill(); this.outline(ctx, "#8a8f98", w);
    ctx.restore();
    ctx.strokeStyle = "#dfe8ee"; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(38 * s, -20 * s); ctx.quadraticCurveTo(40 * s, 10 * s, 20 * s, 30 * s); ctx.stroke();
  },

  key(ctx, w) {
    const s = w / 100;
    ctx.save(); ctx.rotate(-0.3);
    ctx.lineWidth = 7 * s; ctx.strokeStyle = "#c9962a";
    ctx.beginPath(); ctx.arc(-24 * s, 0, 13 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#e3b440";
    ctx.fillRect(-12 * s, -3.5 * s, 50 * s, 7 * s);
    ctx.fillRect(26 * s, 3 * s, 6 * s, 12 * s); ctx.fillRect(36 * s, 3 * s, 5 * s, 9 * s);
    ctx.strokeStyle = "#8a6412"; ctx.lineWidth = 1.5 * s; ctx.strokeRect(-12 * s, -3.5 * s, 50 * s, 7 * s);
    this.ellipse(ctx, -24 * s, 0, 5 * s, 5 * s); ctx.fillStyle = "#7fe0ff"; ctx.fill();
    ctx.restore();
    this.star(ctx, 24 * s, -22 * s, 6 * s, "#fff6c0");
  },

  gnome(ctx, w) {
    const s = w / 100;
    this.ellipse(ctx, 0, 22 * s, 20 * s, 14 * s); ctx.fillStyle = "#3a6ec0"; ctx.fill(); this.outline(ctx, "#3a6ec0", w);
    ctx.beginPath(); ctx.moveTo(-16 * s, -2 * s); ctx.quadraticCurveTo(0, 30 * s, 16 * s, -2 * s); ctx.fillStyle = "#f2f0ea"; ctx.fill(); this.outline(ctx, "#bbb", w);
    this.ellipse(ctx, 0, -8 * s, 12 * s, 11 * s); ctx.fillStyle = "#f4c7a0"; ctx.fill(); this.outline(ctx, "#d49a70", w);
    ctx.beginPath(); ctx.moveTo(-15 * s, -12 * s); ctx.lineTo(4 * s, -48 * s); ctx.lineTo(15 * s, -12 * s); ctx.closePath();
    ctx.fillStyle = "#d8342a"; ctx.fill(); this.outline(ctx, "#d8342a", w);
    this.ellipse(ctx, 0, -4 * s, 4 * s, 3.5 * s); ctx.fillStyle = "#e88a7a"; ctx.fill();
    this.eye(ctx, -5 * s, -11 * s, 2.2 * s); this.eye(ctx, 5 * s, -11 * s, 2.2 * s);
    ctx.strokeStyle = "#6b4a2e"; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(16 * s, 10 * s); ctx.lineTo(40 * s, -20 * s); ctx.stroke();
  },

  squid(ctx, a, w, t) {
    const [body, light, dark] = a.c;
    const s = w / 100 * (a.giant ? 1.08 : 1);
    // arms trail right
    ctx.strokeStyle = body; ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const y0 = (-8 + i * 2.3) * s;
      ctx.lineWidth = (5 - Math.abs(i - 3.5) * 0.6) * s;
      ctx.beginPath(); ctx.moveTo(4 * s, y0);
      ctx.bezierCurveTo(20 * s, y0 + Math.sin(t * 3 + i) * 6 * s, 30 * s, y0 * 1.8, (40 + (i % 3) * 4) * s, y0 * 2.2 + Math.sin(t * 2 + i) * 4 * s);
      ctx.stroke();
    }
    ctx.lineWidth = 3 * s;
    for (const dy of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(4 * s, dy * 4 * s); ctx.quadraticCurveTo(30 * s, dy * 24 * s, 48 * s, dy * 20 * s); ctx.stroke();
      this.ellipse(ctx, 48 * s, dy * 20 * s, 4 * s, 3 * s); ctx.fillStyle = body; ctx.fill();
    }
    // mantle points left
    ctx.beginPath();
    ctx.moveTo(8 * s, -14 * s); ctx.quadraticCurveTo(-26 * s, -18 * s, -46 * s, 0); ctx.quadraticCurveTo(-26 * s, 18 * s, 8 * s, 14 * s);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -16 * s, 0, 16 * s);
    g.addColorStop(0, body); g.addColorStop(1, light);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, dark, w);
    ctx.beginPath(); ctx.moveTo(-36 * s, -4 * s); ctx.lineTo(-52 * s, -16 * s); ctx.lineTo(-44 * s, 0); ctx.lineTo(-52 * s, 16 * s); ctx.lineTo(-36 * s, 4 * s);
    ctx.fillStyle = body; ctx.fill(); this.outline(ctx, dark, w * 0.8);
    ctx.fillStyle = dark; ctx.globalAlpha = 0.35;
    for (let i = 0; i < 10; i++) { this.ellipse(ctx, (-30 + this.h(i) * 34) * s, (-8 + this.h(i, 2) * 16) * s, 2 * s, 2 * s); ctx.fill(); }
    ctx.globalAlpha = 1;
    this.eye(ctx, 2 * s, -6 * s, 5 * s);
  },

  crab(ctx, a, w) {
    const [shell, light, dark] = a.c;
    const s = w / 100;
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s; ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(dir * 16 * s, (6 + i * 5) * s);
        ctx.lineTo(dir * (30 + i * 3) * s, (8 + i * 6) * s); ctx.lineTo(dir * (36 + i * 2) * s, (22 + i * 4) * s); ctx.stroke();
      }
      // claw arm + claw
      ctx.beginPath(); ctx.moveTo(dir * 14 * s, -6 * s); ctx.lineTo(dir * 28 * s, -18 * s); ctx.stroke();
      this.ellipse(ctx, dir * 34 * s, -26 * s, 11 * s, 8 * s, dir * 0.5); ctx.fillStyle = shell; ctx.fill(); this.outline(ctx, dark, w);
      ctx.beginPath(); ctx.moveTo(dir * 36 * s, -26 * s); ctx.lineTo(dir * 46 * s, -30 * s); ctx.strokeStyle = light; ctx.lineWidth = 2.5 * s; ctx.stroke();
      ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
    }
    this.ellipse(ctx, 0, 4 * s, 26 * s, 17 * s);
    const g = ctx.createLinearGradient(0, -14 * s, 0, 20 * s);
    g.addColorStop(0, shell); g.addColorStop(1, light);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, dark, w);
    for (const dir of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(dir * 6 * s, -10 * s); ctx.lineTo(dir * 8 * s, -20 * s); ctx.strokeStyle = dark; ctx.lineWidth = 2 * s; ctx.stroke();
      this.eye(ctx, dir * 8 * s, -21 * s, 4 * s);
    }
    ctx.beginPath(); ctx.arc(0, 4 * s, 6 * s, 0.3, Math.PI - 0.3); ctx.strokeStyle = dark; ctx.lineWidth = 1.8 * s; ctx.stroke();
  },

  lobster(ctx, a, w) {
    const [shell, light, dark] = a.c;
    const s = w / 100;
    // tail segments to the right
    for (let i = 0; i < 5; i++) {
      this.ellipse(ctx, (12 + i * 8) * s, 0, 7 * s, (11 - i * 1.2) * s);
      ctx.fillStyle = i % 2 ? shell : shade(shell, 0.1); ctx.fill(); this.outline(ctx, dark, w * 0.8);
    }
    ctx.beginPath(); ctx.moveTo(50 * s, 0); ctx.lineTo(60 * s, -10 * s); ctx.lineTo(62 * s, 10 * s); ctx.closePath();
    ctx.fillStyle = light; ctx.fill(); this.outline(ctx, dark, w * 0.8);
    // body
    this.ellipse(ctx, -8 * s, 0, 20 * s, 13 * s);
    const g = ctx.createLinearGradient(0, -13 * s, 0, 13 * s);
    g.addColorStop(0, shell); g.addColorStop(1, light);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, dark, w);
    // claws forward-left
    for (const dir of [-1, 1]) {
      ctx.strokeStyle = dark; ctx.lineWidth = 3.5 * s;
      ctx.beginPath(); ctx.moveTo(-22 * s, dir * 8 * s); ctx.lineTo(-34 * s, dir * 20 * s); ctx.stroke();
      this.ellipse(ctx, -44 * s, dir * 24 * s, 12 * s, 7 * s, dir * 0.3); ctx.fillStyle = shell; ctx.fill(); this.outline(ctx, dark, w);
    }
    ctx.strokeStyle = "#e88a5a"; ctx.lineWidth = 1.2 * s;
    for (const dir of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-26 * s, dir * 3 * s); ctx.quadraticCurveTo(-46 * s, dir * 2 * s, -58 * s, dir * 12 * s); ctx.stroke(); }
    this.eye(ctx, -24 * s, -6 * s, 3 * s); this.eye(ctx, -24 * s, 6 * s, 3 * s);
  },

  bottle(ctx, w) {
    const s = w / 100;
    ctx.save(); ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.moveTo(-30 * s, -12 * s); ctx.lineTo(14 * s, -12 * s); ctx.quadraticCurveTo(22 * s, -12 * s, 26 * s, -5 * s);
    ctx.lineTo(38 * s, -5 * s); ctx.lineTo(38 * s, 5 * s); ctx.lineTo(26 * s, 5 * s);
    ctx.quadraticCurveTo(22 * s, 12 * s, 14 * s, 12 * s); ctx.lineTo(-30 * s, 12 * s); ctx.closePath();
    ctx.fillStyle = "rgba(120,200,170,0.55)"; ctx.fill(); this.outline(ctx, "#4a9a7a", w);
    ctx.fillStyle = "#a07048"; ctx.fillRect(38 * s, -5 * s, 7 * s, 10 * s);
    // the scroll inside
    ctx.fillStyle = "#f4e6c2"; ctx.fillRect(-22 * s, -6 * s, 34 * s, 12 * s);
    ctx.strokeStyle = "#c8a870"; ctx.lineWidth = 1 * s;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-18 * s, (-2 + i * 3) * s); ctx.lineTo(8 * s, (-2 + i * 3) * s); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-26 * s, -9 * s, 30 * s, 2.5 * s);
    ctx.restore();
  },

  turtle(ctx, a, w) {
    const [shell, skin, dark] = a.c;
    const s = w / 100;
    ctx.fillStyle = skin;
    for (const [x, y, rx, ry, r] of [[-22, -20, 16, 6, -0.6], [-22, 20, 16, 6, 0.6], [24, -16, 10, 5, 0.5], [24, 16, 10, 5, -0.5]]) {
      this.ellipse(ctx, x * s, y * s, rx * s, ry * s, r); ctx.fill(); this.outline(ctx, dark, w * 0.8);
    }
    this.ellipse(ctx, -40 * s, 0, 11 * s, 9 * s); ctx.fill(); this.outline(ctx, dark, w);
    this.ellipse(ctx, 0, 0, 32 * s, 24 * s);
    const g = ctx.createRadialGradient(-6 * s, -6 * s, 2 * s, 0, 0, 34 * s);
    g.addColorStop(0, shade(shell, 0.25)); g.addColorStop(1, shell);
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, dark, w);
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6 * s; ctx.globalAlpha = 0.6;
    for (const [x, y] of [[0, 0], [-16, -8], [16, -8], [-16, 9], [16, 9]]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; ctx.lineTo((x + Math.cos(ang) * 8) * s, (y + Math.sin(ang) * 7) * s); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.eye(ctx, -44 * s, -3 * s, 3 * s);
  },

  chest(ctx, w) {
    const s = w / 100;
    ctx.fillStyle = "#8a5a2e"; ctx.fillRect(-34 * s, -6 * s, 68 * s, 34 * s);
    ctx.beginPath(); ctx.moveTo(-34 * s, -6 * s); ctx.quadraticCurveTo(0, -38 * s, 34 * s, -6 * s); ctx.closePath();
    ctx.fillStyle = "#a36a36"; ctx.fill();
    ctx.beginPath(); ctx.rect(-34 * s, -6 * s, 68 * s, 34 * s); this.outline(ctx, "#8a5a2e", w);
    ctx.beginPath(); ctx.moveTo(-34 * s, -6 * s); ctx.quadraticCurveTo(0, -38 * s, 34 * s, -6 * s); this.outline(ctx, "#8a5a2e", w);
    ctx.fillStyle = "#d9a52a";
    for (const x of [-26, 20]) ctx.fillRect(x * s, -18 * s, 6 * s, 46 * s);
    ctx.fillRect(-34 * s, -8 * s, 68 * s, 5 * s);
    ctx.fillRect(-6 * s, -4 * s, 12 * s, 14 * s);
    ctx.fillStyle = "#3b2a1a"; ctx.fillRect(-2 * s, 1 * s, 4 * s, 6 * s);
    // gold spilling out
    for (let i = 0; i < 5; i++) {
      this.ellipse(ctx, (-18 + i * 9) * s, -10 * s - Math.abs(i - 2) * -2 * s, 5 * s, 3 * s);
      ctx.fillStyle = "#f6c431"; ctx.fill(); this.outline(ctx, "#c9962a", w * 0.5);
    }
    this.star(ctx, 22 * s, -26 * s, 6 * s, "#fffbe0");
  },

  coin(ctx, w) {
    const s = w / 100;
    this.ellipse(ctx, 0, 0, 28 * s, 28 * s);
    const g = ctx.createRadialGradient(-8 * s, -8 * s, 2 * s, 0, 0, 30 * s);
    g.addColorStop(0, "#fff0a0"); g.addColorStop(0.6, "#f2c032"); g.addColorStop(1, "#c98a14");
    ctx.fillStyle = g; ctx.fill(); this.outline(ctx, "#c98a14", w);
    this.ellipse(ctx, 0, 0, 21 * s, 21 * s); ctx.strokeStyle = "#b07a10"; ctx.lineWidth = 2 * s; ctx.stroke();
    // skull and crossbones, friendly edition
    this.ellipse(ctx, 0, -4 * s, 8 * s, 7 * s); ctx.fillStyle = "#b07a10"; ctx.fill();
    ctx.fillRect(-4 * s, 1 * s, 8 * s, 6 * s);
    ctx.strokeStyle = "#b07a10"; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(-12 * s, 8 * s); ctx.lineTo(12 * s, 16 * s); ctx.moveTo(12 * s, 8 * s); ctx.lineTo(-12 * s, 16 * s); ctx.stroke();
    ctx.fillStyle = "#f2c032"; this.ellipse(ctx, -3 * s, -4 * s, 2 * s, 2 * s); ctx.fill(); this.ellipse(ctx, 3 * s, -4 * s, 2 * s, 2 * s); ctx.fill();
    this.star(ctx, 18 * s, -18 * s, 6 * s, "#ffffff");
  },

  fossil(ctx, w) {
    const s = w / 100;
    ctx.beginPath();
    ctx.moveTo(-40 * s, -10 * s); ctx.lineTo(-20 * s, -28 * s); ctx.lineTo(24 * s, -26 * s); ctx.lineTo(42 * s, -2 * s);
    ctx.lineTo(30 * s, 24 * s); ctx.lineTo(-18 * s, 26 * s); ctx.lineTo(-42 * s, 10 * s); ctx.closePath();
    ctx.fillStyle = "#c9b894"; ctx.fill(); this.outline(ctx, "#8a7a5a", w);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 12; i++) { this.ellipse(ctx, (-30 + this.h(i) * 60) * s, (-20 + this.h(i, 2) * 40) * s, 2.5 * s, 1.5 * s); ctx.fill(); }
    // spiral ammonite
    ctx.strokeStyle = "#7a6a4a"; ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) { const ang = i * 0.28, r = 1 + i * 0.36; ctx.lineTo((-4 + Math.cos(ang) * r) * s, (0 + Math.sin(ang) * r) * s); }
    ctx.stroke();
    ctx.lineWidth = 1.4 * s;
    for (let i = 10; i < 60; i += 5) {
      const ang = i * 0.28, r = 1 + i * 0.36;
      ctx.beginPath(); ctx.moveTo((-4 + Math.cos(ang) * r * 0.7) * s, Math.sin(ang) * r * 0.7 * s); ctx.lineTo((-4 + Math.cos(ang) * r) * s, Math.sin(ang) * r * s); ctx.stroke();
    }
  },

  relic(ctx, w, t) {
    const s = w / 100;
    const glow = ctx.createRadialGradient(0, -4 * s, 2 * s, 0, 0, 44 * s);
    glow.addColorStop(0, `rgba(120,255,220,${0.35 + 0.15 * Math.sin(t * 2)})`); glow.addColorStop(1, "rgba(120,255,220,0)");
    ctx.fillStyle = glow; this.ellipse(ctx, 0, 0, 44 * s, 36 * s); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -34 * s); ctx.lineTo(22 * s, -8 * s); ctx.lineTo(16 * s, 28 * s); ctx.lineTo(-16 * s, 28 * s); ctx.lineTo(-22 * s, -8 * s); ctx.closePath();
    ctx.fillStyle = "#6a7a70"; ctx.fill(); this.outline(ctx, "#4a5a52", w);
    ctx.strokeStyle = "#7fffe0"; ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.arc(0, -2 * s, 8 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24 * s); ctx.lineTo(0, -10 * s); ctx.moveTo(0, 6 * s); ctx.lineTo(0, 20 * s);
    ctx.moveTo(-14 * s, -2 * s); ctx.lineTo(-8 * s, -2 * s); ctx.moveTo(8 * s, -2 * s); ctx.lineTo(14 * s, -2 * s); ctx.stroke();
    ctx.fillStyle = "#b8fff0"; this.ellipse(ctx, 0, -2 * s, 3 * s, 3 * s); ctx.fill();
  },

  jelly(ctx, a, w, t) {
    const [c1, c2, c3] = a.c;
    const s = w / 100;
    ctx.save(); ctx.rotate(-Math.PI / 2 * 0.0);
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const x0 = (-18 + i * 6) * s;
      ctx.strokeStyle = [c1, c2, c3][i % 3]; ctx.lineWidth = 2.4 * s; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x0, 0);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x0 + Math.sin(t * 2 + i + k * 0.9) * 4 * s, k * 6 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(-28 * s, 2 * s); ctx.quadraticCurveTo(-30 * s, -34 * s, 0, -36 * s); ctx.quadraticCurveTo(30 * s, -34 * s, 28 * s, 2 * s);
    ctx.quadraticCurveTo(0, -6 * s, -28 * s, 2 * s);
    const g = ctx.createLinearGradient(-28 * s, -36 * s, 28 * s, 0);
    g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c3);
    ctx.fillStyle = g; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; this.outline(ctx, "#7a5ac0", w);
    for (let i = 0; i < 6; i++) this.star(ctx, (-18 + this.h(i) * 36) * s, (-28 + this.h(i, 2) * 22) * s, (2 + this.h(i, 3) * 3) * s, "rgba(255,255,255,0.9)");
    ctx.restore();
  },

  /* ------------------------------------------------------------ people */

  // Colours per character. The player is `you`; helpers each own a silhouette
  // cue (Sam's cap, Mia's backpack, Old Jack's beard, Penny's bun, Nana's
  // sunhat, Kofi's captain's hat) so they read even when small.
  PEOPLE: {
    you:   { skin: "#f1c7a0", shirt: "#e3643a", pants: "#35577f", hat: "bucket", hatC: "#e8c24a" },
    sam:   { skin: "#c8906a", shirt: "#3f8a5a", pants: "#4a4a58", hat: "cap", hatC: "#2f6fb8" },
    mia:   { skin: "#f4d0b0", shirt: "#8a5ac0", pants: "#2f4a6a", hat: "hair", hatC: "#3a2418", pack: "#e0a030" },
    penny: { skin: "#e8b890", shirt: "#d8465a", pants: "#3a3a4a", hat: "bun", hatC: "#6a3a1a", apron: "#fff6e0" },
    jack:  { skin: "#e8b89a", shirt: "#5a6e8a", pants: "#5a4a3a", hat: "beanie", hatC: "#b8362a", beard: "#eeeeee" },
    nana:  { skin: "#f0c8a8", shirt: "#e88aa8", pants: "#7a6aa0", hat: "sunhat", hatC: "#f4e2a8" },
    kofi:  { skin: "#7a5238", shirt: "#f2f2f2", pants: "#20304a", hat: "captain", hatC: "#20304a" },
  },

  // A standing or sitting figure, feet at (0,0), `s` = height in px.
  person(ctx, who, s, pose = {}) {
    const p = this.PEOPLE[who] || this.PEOPLE.you;
    const u = s / 100;
    ctx.save();
    const sit = pose.sit;
    // legs
    ctx.fillStyle = p.pants;
    if (sit) {
      ctx.beginPath(); ctx.roundRect(-10 * u, -34 * u, 26 * u, 12 * u, 5 * u); ctx.fill();
      ctx.beginPath(); ctx.roundRect(8 * u, -34 * u, 9 * u, 34 * u, 4 * u); ctx.fill();
      ctx.fillStyle = "#3a2a20"; ctx.beginPath(); ctx.roundRect(6 * u, -6 * u, 16 * u, 7 * u, 3 * u); ctx.fill();
    } else {
      ctx.beginPath(); ctx.roundRect(-10 * u, -42 * u, 9 * u, 42 * u, 4 * u); ctx.fill();
      ctx.beginPath(); ctx.roundRect(2 * u, -42 * u, 9 * u, 42 * u, 4 * u); ctx.fill();
      ctx.fillStyle = "#3a2a20";
      ctx.beginPath(); ctx.roundRect(-12 * u, -6 * u, 13 * u, 7 * u, 3 * u); ctx.fill();
      ctx.beginPath(); ctx.roundRect(1 * u, -6 * u, 13 * u, 7 * u, 3 * u); ctx.fill();
    }
    const bodyTop = sit ? -70 * u : -78 * u, bodyBot = sit ? -30 * u : -38 * u;
    if (p.pack) { ctx.fillStyle = p.pack; ctx.beginPath(); ctx.roundRect(-20 * u, bodyTop + 6 * u, 12 * u, 30 * u, 4 * u); ctx.fill(); }
    // body
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.roundRect(-13 * u, bodyTop, 26 * u, bodyBot - bodyTop, 9 * u); ctx.fill();
    ctx.strokeStyle = shade(p.shirt, -0.45); ctx.lineWidth = Math.max(1, 2.2 * u); ctx.stroke();
    if (p.apron) { ctx.fillStyle = p.apron; ctx.beginPath(); ctx.roundRect(-9 * u, bodyTop + 12 * u, 18 * u, bodyBot - bodyTop - 10 * u, 4 * u); ctx.fill(); }
    // arms reach toward the rod grip (or rest)
    const hand = pose.hand || { x: 18 * u, y: bodyTop + 22 * u };
    ctx.strokeStyle = p.shirt; ctx.lineWidth = 8 * u; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6 * u, bodyTop + 8 * u); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    ctx.fillStyle = p.skin; this.ellipse(ctx, hand.x, hand.y, 4.5 * u, 4.5 * u); ctx.fill();
    // head
    const hy = bodyTop - 14 * u;
    this.ellipse(ctx, 0, hy, 15 * u, 15 * u); ctx.fillStyle = p.skin; ctx.fill();
    ctx.strokeStyle = shade(p.skin, -0.45); ctx.lineWidth = Math.max(1, 2 * u); ctx.stroke();
    if (p.beard) {
      ctx.beginPath(); ctx.moveTo(-12 * u, hy + 2 * u); ctx.quadraticCurveTo(2 * u, hy + 26 * u, 14 * u, hy + 2 * u);
      ctx.fillStyle = p.beard; ctx.fill();
    }
    // face (looking right, toward the water)
    ctx.fillStyle = "#2a2020";
    this.ellipse(ctx, 6 * u, hy - 2 * u, 2 * u, 2.4 * u); ctx.fill();
    ctx.strokeStyle = "#8a4a3a"; ctx.lineWidth = Math.max(1, 1.6 * u);
    ctx.beginPath(); ctx.arc(7 * u, hy + 5 * u, 4 * u, 0.2, 1.4); ctx.stroke();
    ctx.fillStyle = "rgba(230,120,110,0.35)"; this.ellipse(ctx, 10 * u, hy + 4 * u, 3 * u, 2 * u); ctx.fill();
    // hats
    ctx.fillStyle = p.hatC;
    switch (p.hat) {
      case "bucket":
        ctx.beginPath(); ctx.roundRect(-12 * u, hy - 20 * u, 24 * u, 12 * u, 5 * u); ctx.fill();
        this.ellipse(ctx, 0, hy - 9 * u, 20 * u, 5 * u); ctx.fill();
        break;
      case "cap":
        ctx.beginPath(); ctx.arc(0, hy - 6 * u, 14 * u, Math.PI, 0); ctx.fill();
        ctx.fillRect(4 * u, hy - 8 * u, 18 * u, 4 * u);
        break;
      case "hair":
        ctx.beginPath(); ctx.arc(0, hy - 3 * u, 16 * u, Math.PI * 0.95, Math.PI * 1.9); ctx.fill();
        this.ellipse(ctx, -14 * u, hy + 4 * u, 5 * u, 12 * u); ctx.fill();
        break;
      case "bun":
        ctx.beginPath(); ctx.arc(0, hy - 3 * u, 15.5 * u, Math.PI * 0.9, Math.PI * 1.95); ctx.fill();
        this.ellipse(ctx, -4 * u, hy - 20 * u, 7 * u, 6 * u); ctx.fill();
        break;
      case "beanie":
        ctx.beginPath(); ctx.arc(0, hy - 5 * u, 15 * u, Math.PI, 0); ctx.fill();
        this.ellipse(ctx, 0, hy - 22 * u, 4 * u, 4 * u); ctx.fillStyle = "#fff"; ctx.fill();
        break;
      case "sunhat":
        this.ellipse(ctx, 0, hy - 9 * u, 25 * u, 6 * u); ctx.fill();
        ctx.beginPath(); ctx.arc(0, hy - 9 * u, 11 * u, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#e88aa8"; ctx.fillRect(-11 * u, hy - 13 * u, 22 * u, 3 * u);
        break;
      case "captain":
        ctx.beginPath(); ctx.roundRect(-13 * u, hy - 22 * u, 26 * u, 11 * u, 4 * u); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(-14 * u, hy - 13 * u, 28 * u, 4 * u);
        ctx.fillStyle = "#f2c032"; this.ellipse(ctx, 0, hy - 17 * u, 3 * u, 3 * u); ctx.fill();
        break;
    }
    ctx.restore();
  },

  /* ------------------------------------------------------------ boats */

  // A boat side-on, waterline at y=0, facing right. `size` = length in px.
  boat(ctx, id, size, t = 0) {
    const u = size / 100;
    ctx.save();
    const hull = (col, deck, len, h) => {
      ctx.beginPath();
      ctx.moveTo(-len / 2 * u, -h * u); ctx.lineTo(len / 2 * u + 8 * u, -h * u);
      ctx.quadraticCurveTo(len / 2 * u, 4 * u, len / 2 * u - 12 * u, 6 * u);
      ctx.lineTo(-len / 2 * u + 6 * u, 6 * u); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = Math.max(1, 2 * u); ctx.stroke();
      ctx.fillStyle = deck; ctx.fillRect(-len / 2 * u, -h * u - 3 * u, len * u + 8 * u, 4 * u);
    };
    switch (id) {
      case "dinghy":
        // The player's own little motorboat: no mast to get in the way of the rod.
        hull("#e8664a", "#f6e2c0", 90, 13);
        ctx.fillStyle = "#fffaf0"; ctx.fillRect(-44 * u, -8 * u, 88 * u, 4 * u);
        ctx.fillStyle = "#3a3f48"; ctx.fillRect(-52 * u, -26 * u, 10 * u, 20 * u);
        ctx.fillStyle = "#5a606a"; ctx.fillRect(-49 * u, -6 * u, 4 * u, 18 * u);
        ctx.fillStyle = "#ffcf3a"; ctx.fillRect(-52 * u, -26 * u, 10 * u, 4 * u);
        break;
      case "workboat":
        // The player's deep-water boat: wheelhouse at the stern, open deck forward.
        hull("#2a3a4a", "#d8342a", 120, 20);
        ctx.fillStyle = "#f2efe6"; ctx.fillRect(-60 * u, -48 * u, 30 * u, 26 * u);
        ctx.strokeStyle = "#3a4a5a"; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeRect(-60 * u, -48 * u, 30 * u, 26 * u);
        ctx.fillStyle = "#7fc8f0"; ctx.fillRect(-56 * u, -43 * u, 9 * u, 8 * u); ctx.fillRect(-44 * u, -43 * u, 9 * u, 8 * u);
        ctx.fillStyle = "#d8342a"; ctx.fillRect(-62 * u, -52 * u, 34 * u, 5 * u);
        ctx.strokeStyle = "#8a96a6"; ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.beginPath(); ctx.moveTo(-45 * u, -52 * u); ctx.lineTo(-45 * u, -70 * u); ctx.stroke();
        ctx.fillStyle = `rgba(255,220,120,${0.6 + 0.4 * Math.sin(t * 3)})`; this.ellipse(ctx, -45 * u, -71 * u, 2.5 * u, 2.5 * u); ctx.fill();
        break;
      case "smallboat":
        hull("#e8664a", "#f6e2c0", 80, 12);
        ctx.fillStyle = "#6b4a2e"; ctx.fillRect(-2 * u, -60 * u, 3 * u, 48 * u);
        ctx.beginPath(); ctx.moveTo(2 * u, -58 * u); ctx.quadraticCurveTo(30 * u, -34 * u, 34 * u, -16 * u); ctx.lineTo(2 * u, -16 * u); ctx.closePath();
        ctx.fillStyle = "#fffaf0"; ctx.fill(); ctx.strokeStyle = "#c8b89a"; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.stroke();
        break;
      case "fishingboat":
        hull("#2f6fb8", "#e8e0d0", 90, 16);
        ctx.fillStyle = "#fffaf0"; ctx.fillRect(-20 * u, -40 * u, 30 * u, 22 * u);
        ctx.strokeStyle = "#3a4a5a"; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeRect(-20 * u, -40 * u, 30 * u, 22 * u);
        ctx.fillStyle = "#7fc8f0"; ctx.fillRect(-14 * u, -35 * u, 8 * u, 7 * u); ctx.fillRect(-2 * u, -35 * u, 8 * u, 7 * u);
        ctx.fillStyle = "#d8342a"; ctx.fillRect(-22 * u, -44 * u, 34 * u, 5 * u);
        ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = Math.max(1, 2 * u);
        ctx.beginPath(); ctx.moveTo(24 * u, -18 * u); ctx.lineTo(34 * u, -56 * u); ctx.lineTo(48 * u, -20 * u); ctx.stroke();
        break;
      case "trawler":
        hull("#2a3a4a", "#d8342a", 110, 20);
        ctx.fillStyle = "#f2efe6"; ctx.fillRect(-40 * u, -48 * u, 38 * u, 26 * u);
        ctx.strokeStyle = "#3a4a5a"; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeRect(-40 * u, -48 * u, 38 * u, 26 * u);
        ctx.fillStyle = "#7fc8f0"; for (let i = 0; i < 3; i++) ctx.fillRect((-36 + i * 11) * u, -43 * u, 7 * u, 7 * u);
        ctx.fillStyle = "#e8b43a"; ctx.fillRect(-30 * u, -64 * u, 8 * u, 16 * u);
        ctx.strokeStyle = "#e8b43a"; ctx.lineWidth = Math.max(1, 3 * u);
        ctx.beginPath(); ctx.moveTo(10 * u, -22 * u); ctx.lineTo(40 * u, -70 * u); ctx.lineTo(56 * u, -26 * u); ctx.stroke();
        ctx.strokeStyle = "rgba(240,240,240,0.7)"; ctx.lineWidth = Math.max(1, 1 * u);
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(40 * u, -70 * u); ctx.lineTo((46 + i * 4) * u, -24 * u); ctx.stroke(); }
        // smoke
        ctx.fillStyle = "rgba(230,230,230,0.5)";
        for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; this.ellipse(ctx, (-26 - k * 20) * u, (-70 - k * 30) * u, (4 + k * 8) * u, (4 + k * 8) * u); ctx.fill(); }
        break;
      case "vessel":
        hull("#f2f2f2", "#1f5fae", 130, 24);
        ctx.fillStyle = "#1f5fae"; ctx.fillRect(-60 * u, -12 * u, 132 * u, 5 * u);
        ctx.fillStyle = "#fffaf0"; ctx.fillRect(-50 * u, -54 * u, 60 * u, 30 * u); ctx.fillRect(-40 * u, -74 * u, 36 * u, 20 * u);
        ctx.strokeStyle = "#4a5a6a"; ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.strokeRect(-50 * u, -54 * u, 60 * u, 30 * u); ctx.strokeRect(-40 * u, -74 * u, 36 * u, 20 * u);
        ctx.fillStyle = "#2a3a4a"; for (let i = 0; i < 5; i++) ctx.fillRect((-46 + i * 11) * u, -47 * u, 7 * u, 6 * u);
        ctx.fillStyle = "#f2c032"; this.ellipse(ctx, 40 * u, -34 * u, 10 * u, 10 * u); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#e8b43a"; ctx.lineWidth = Math.max(1, 2.5 * u);
        ctx.beginPath(); ctx.moveTo(20 * u, -26 * u); ctx.lineTo(56 * u, -84 * u); ctx.stroke();
        ctx.fillStyle = "#ff5a3a"; this.ellipse(ctx, -22 * u, -80 * u, 2.5 * u, 2.5 * u); ctx.fill();
        break;
      case "charter":
        hull("#fffaf0", "#2aa38a", 96, 14);
        ctx.fillStyle = "#2aa38a"; ctx.fillRect(-30 * u, -38 * u, 50 * u, 4 * u);
        ctx.strokeStyle = "#6a7a8a"; ctx.lineWidth = Math.max(1, 1.5 * u);
        for (const x of [-28, -4, 18]) { ctx.beginPath(); ctx.moveTo(x * u, -34 * u); ctx.lineTo(x * u, -16 * u); ctx.stroke(); }
        ctx.fillStyle = "#f4c7a0";
        for (let i = 0; i < 4; i++) { this.ellipse(ctx, (-22 + i * 12) * u, -22 * u, 3.5 * u, 3.5 * u); ctx.fill(); }
        ctx.fillStyle = "#ff7ab0"; ctx.fillRect(-26 * u, -27 * u, 6 * u, 2.5 * u);
        break;
    }
    ctx.restore();
  },
};
