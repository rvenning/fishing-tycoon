// Paint: the Storybook Pond toolkit — watercolour washes, one warm brown pen,
// paper grain, and the painted pieces every screen shares.
//
// Two rules keep this file honest:
//   1. Nothing here may move anything or change a number the rules read. It
//      only draws what it is told to draw, where it is told to draw it.
//   2. Every random-looking wobble comes from a SEED, so a baked world and a
//      cached sprite look identical every time they are painted.
//
// Expensive things (whole worlds, people, textures) are painted once and
// blitted; see personSprite() and Scene.backdrop().

const Paint = (() => {
  const INK = "#4a3222";

  /* ---------------------------------------------------------------- colour */
  function mulberry(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hx = (h) => { const n = parseInt(String(h).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hx(h); return `rgba(${r},${g},${b},${a})`; };
  const mix = (h1, h2, k) => {
    const a = hx(h1), b = hx(h2);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("");
  };
  const dark = (h, k) => mix(h, "#2a1a10", k);
  const light = (h, k) => mix(h, "#fffbe8", k);
  // The pen colour for anything painted in `col`: its own shadow pulled toward the ink.
  const penFor = (col) => mix(dark(col, 0.45), INK, 0.55);

  /* ---------------------------------------------------------------- brush */
  function blob(cx, cy, rx, ry, seed, n = 24, amp = 0.1) {
    const r = mulberry(Math.floor(seed * 9973) + 17), p = [r() * 6.3, r() * 6.3, r() * 6.3], pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + amp * (Math.sin(a * 2 + p[0]) * 0.55 + Math.sin(a * 3 + p[1]) * 0.3 + Math.sin(a * 5 + p[2]) * 0.15);
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }

  // Short polygons (walls, roofs, planks, boxes) keep their corners; longer
  // point lists are organic and get smoothed. `pts.soft = true` forces smoothing.
  function trace(ctx, pts, closed = true) {
    ctx.beginPath();
    if (pts.length <= 5 && !pts.soft) {
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (closed) ctx.closePath();
      return;
    }
    if (!closed) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      }
      const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
      return;
    }
    const n = pts.length;
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.closePath();
  }

  // A watercolour wash: offset translucent fills and a darker pooled edge.
  function wash(ctx, pts, col, o = {}) {
    const layers = o.layers || 3, j = o.jitter ?? 1.2, a = o.alpha ?? 0.95;
    const r = mulberry((o.seed || 1) * 131 + 3);
    for (let i = 0; i < layers; i++) {
      ctx.save(); ctx.translate((r() - 0.5) * j * 2, (r() - 0.5) * j * 2);
      trace(ctx, pts); ctx.fillStyle = rgba(col, i === 0 ? a : a * 0.35); ctx.fill();
      ctx.restore();
    }
    if (o.edge !== 0) {
      trace(ctx, pts); ctx.strokeStyle = rgba(dark(col, 0.25), o.edge ?? 0.35);
      ctx.lineWidth = o.edgeW || 1.6; ctx.stroke();
    }
  }

  function ink(ctx, pts, closed = true, w = 2, col = INK, alpha = 0.9) {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    trace(ctx, pts, closed); ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = w; ctx.stroke();
    ctx.save(); ctx.translate(w * 0.25, w * 0.18);
    trace(ctx, pts, closed); ctx.strokeStyle = rgba(col, alpha * 0.3); ctx.lineWidth = w * 0.55; ctx.stroke();
    ctx.restore();
  }

  function line(ctx, fn, w = 2, col = INK, alpha = 0.9) {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); fn(); ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = w; ctx.stroke();
  }

  // Wash + pen in one call: the everyday shape.
  function shape(ctx, pts, col, w = 2, o = {}) {
    wash(ctx, pts, col, { layers: 2, edge: 0.3, ...o });
    ink(ctx, pts, o.closed ?? true, w, o.pen || INK, o.penAlpha ?? 0.85);
  }

  function dabs(ctx, cx, cy, rx, ry, col, n, seed, size = 3, alpha = 0.5) {
    const r = mulberry(seed * 77 + 5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, size * (0.6 + r()), size * (0.4 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, alpha * (0.5 + r() * 0.5)); ctx.fill();
    }
  }

  function star(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r, a = (i / 8) * Math.PI * 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }

  /* ---------------------------------------------------------------- textures */
  let PAPER = null, GRAIN = null, WOOD = null;
  function paper() {
    if (PAPER) return PAPER;
    const size = 512, c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), r = mulberry(3);
    g.fillStyle = "#f3e9d2"; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = rgba(r() < 0.5 ? "#c9b48a" : "#fffaf0", r() * 0.09);
      const s = r() * 60 + 8, x = r() * size, y = r() * size, ry = s * (0.3 + r() * 0.7), rot = r() * 3;
      // draw each blot at its wrapped positions too, so the tile has no seams
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        if (x + dx < -s || x + dx > size + s || y + dy < -s || y + dy > size + s) continue;
        g.beginPath(); g.ellipse(x + dx, y + dy, s, ry, rot, 0, Math.PI * 2); g.fill();
      }
    }
    const img = g.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 20; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(150,120,80,0.08)"; g.lineWidth = 0.7;
    for (let i = 0; i < 140; i++) {
      const x = r() * size, y = r() * size, l = 6 + r() * 16, a = r() * 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return (PAPER = c);
  }
  function grain() {
    if (GRAIN) return GRAIN;
    const size = 256, c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data, r = mulberry(9);
    for (let i = 0; i < d.length; i += 4) { const v = 215 + r() * 40; d[i] = v; d[i + 1] = v * 0.96; d[i + 2] = v * 0.88; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (GRAIN = c);
  }
  function wood() {
    if (WOOD) return WOOD;
    const w = 900, h = 260, c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), r = mulberry(5), plank = h / 3;
    for (let p = 0; p < 3; p++) {
      g.fillStyle = ["#9c6536", "#a86f3d", "#93602f"][p]; g.fillRect(0, p * plank, w, plank);
      for (let i = 0; i < 26; i++) {
        const y0 = p * plank + r() * plank;
        g.beginPath(); g.moveTo(0, y0);
        for (let x = 0; x <= w; x += 20) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 3 + Math.sin(x * 0.043 + i * 2) * 1.5);
        g.strokeStyle = rgba(r() < 0.5 ? "#6a3f1d" : "#c68a52", 0.18 + r() * 0.2); g.lineWidth = 0.8 + r() * 1.6; g.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const kx = r() * w, ky = p * plank + plank * (0.3 + r() * 0.4);
        for (let q = 0; q < 4; q++) { g.beginPath(); g.ellipse(kx, ky, 14 - q * 3, 5 - q, 0, 0, Math.PI * 2); g.strokeStyle = "rgba(90,52,24,0.35)"; g.lineWidth = 1.2; g.stroke(); }
      }
      g.fillStyle = "rgba(60,34,14,0.55)"; g.fillRect(0, p * plank + plank - 3, w, 3);
      g.fillStyle = "rgba(255,220,170,0.25)"; g.fillRect(0, p * plank, w, 2);
    }
    return (WOOD = c);
  }
  // Publish the paper and wood as CSS custom properties, once, at boot.
  function installTextures() {
    try {
      const root = document.documentElement.style;
      root.setProperty("--paper-tex", `url(${paper().toDataURL("image/jpeg", 0.82)})`);
      root.setProperty("--wood-tex", `url(${wood().toDataURL("image/jpeg", 0.85)})`);
    } catch (e) { /* the flat colours underneath still work */ }
  }
  function grainOver(ctx, W, H, alpha = 0.5, atop = false) {
    ctx.save();
    ctx.globalCompositeOperation = atop ? "source-atop" : "multiply";
    if (atop) {
      // tint only what is already painted, then multiply-darken through it
      ctx.globalAlpha = alpha * 0.5;
    } else ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.createPattern(grain(), "repeat");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- scenery */
  const GREENS = ["#6f9a3e", "#5f8f38", "#7ea948", "#4f7f32", "#88b25a"];

  function tree(ctx, x, y, s, seed, col) {
    const r = mulberry(seed * 31 + 7), g = col || GREENS[Math.floor(r() * GREENS.length)];
    const tw = 5 * s;
    const trunk = [[x - tw, y], [x - tw * 0.6, y - 26 * s], [x + tw * 0.6, y - 26 * s], [x + tw, y]];
    wash(ctx, trunk, "#7a5230", { layers: 1, edge: 0, seed });
    ink(ctx, trunk, false, 1.1 * Math.min(1.6, s), INK, 0.55);
    const n = 5 + Math.floor(r() * 3), blobs = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = r() * 16 * s;
      blobs.push([x + Math.cos(a) * d * 1.3, y - 44 * s + Math.sin(a) * d * 0.9, (14 + r() * 10) * s]);
    }
    blobs.sort((p, q) => q[1] - p[1]);
    for (const [bx, by, br] of blobs) wash(ctx, blob(bx, by, br, br * 0.9, seed + bx, 18, 0.16), dark(g, 0.12), { layers: 2, seed: seed + by, edge: 0.3 });
    for (const [bx, by, br] of blobs) wash(ctx, blob(bx - br * 0.2, by - br * 0.25, br * 0.62, br * 0.5, seed + bx * 2, 14, 0.18), light(g, 0.28), { layers: 1, edge: 0, alpha: 0.55, seed });
    dabs(ctx, x, y - 44 * s, 26 * s, 22 * s, dark(g, 0.35), 22, seed, 2.2 * s, 0.45);
    ink(ctx, blob(x, y - 46 * s, 30 * s, 28 * s, seed + 3, 22, 0.2), true, 1.2 * Math.min(1.5, s), INK, 0.28);
  }

  function conifer(ctx, x, y, s, seed, col = "#4f7f32") {
    wash(ctx, [[x - 2 * s, y], [x - 2 * s, y - 10 * s], [x + 2 * s, y - 10 * s], [x + 2 * s, y]], "#6a4526", { layers: 1, edge: 0 });
    for (let i = 0; i < 4; i++) {
      const w = (20 - i * 4) * s, yy = y - 8 * s - i * 11 * s;
      const pts = [[x - w, yy], [x - w * 0.3, yy - 8 * s], [x, yy - 22 * s], [x + w * 0.3, yy - 8 * s], [x + w, yy], [x, yy + 3 * s]];
      wash(ctx, pts, i % 2 ? light(col, 0.1) : col, { layers: 2, seed: seed + i, edge: 0.35 });
    }
    dabs(ctx, x, y - 30 * s, 10 * s, 20 * s, dark(col, 0.4), 8, seed, 2 * s, 0.4);
    ink(ctx, [[x - 20 * s, y - 8 * s], [x, y - 60 * s], [x + 20 * s, y - 8 * s]], false, 1.1 * s, INK, 0.3);
  }

  function cloud(ctx, x, y, s, seed, shade = "#c9dbe0") {
    const parts = [[0, 0, 26], [24, -12, 30], [52, -2, 24], [74, 6, 18], [-22, 8, 16]];
    for (const [dx, dy, rr] of parts) wash(ctx, blob(x + dx * s, y + dy * s + 6 * s, rr * s * 1.05, rr * s * 0.7, seed + dx, 16, 0.08), shade, { layers: 1, edge: 0, alpha: 0.55 });
    // The pen follows the puffs: stroke every puff, then paint the white over
    // them, so only the outside edge of the whole cloud is left showing. (One
    // big ellipse round the lot read as a stray outline floating beside it.)
    const puffs = parts.map(([dx, dy, rr]) => blob(x + dx * s, y + dy * s, rr * s, rr * s * 0.8, seed + dx + 5, 16, 0.08));
    for (const pts of puffs) { trace(ctx, pts); ctx.strokeStyle = rgba("#8aa6b0", 0.4); ctx.lineWidth = 1.8 * Math.max(0.7, s); ctx.stroke(); }
    for (const pts of puffs) wash(ctx, pts, "#fffdf6", { layers: 2, edge: 0, alpha: 1 });
  }

  function reed(ctx, x, y, h, lean, sway, seed, head = true) {
    line(ctx, () => { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.55, x + lean + sway, y - h); }, Math.max(1.4, h * 0.016), "#4e7a34", 0.95);
    if (head) {
      const hx2 = x + lean * 0.85 + sway * 0.85, hy2 = y - h * 0.82;
      ctx.beginPath(); ctx.ellipse(hx2, hy2, Math.max(2, h * 0.02), Math.max(5, h * 0.06), lean * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = "#7a4a2a"; ctx.fill(); ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 1; ctx.stroke();
    }
    void seed;
  }

  function grassTuft(ctx, x, y, s, col, seed) {
    const r = mulberry(seed);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 1.3, l = (10 + r() * 16) * s;
      line(ctx, () => { ctx.moveTo(x + (r() - 0.5) * 10 * s, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.4, y - l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); }, 1.8 * s, r() < 0.5 ? col : dark(col, 0.2), 0.9);
    }
  }

  function flowers(ctx, x, y, w, h, seed, n = 16, s = 1) {
    const r = mulberry(seed), cols = ["#f09a3e", "#f4d04b", "#e46a5a", "#b98ad8", "#fff4dc"];
    for (let i = 0; i < n; i++) {
      const fx = x + r() * w, fy = y + r() * h, c = cols[Math.floor(r() * cols.length)], ps = (2.4 + r() * 2) * s;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * ps, fy + Math.sin(a) * ps, ps * 0.75, 0, Math.PI * 2); ctx.fillStyle = rgba(c, 0.9); ctx.fill(); }
      ctx.beginPath(); ctx.arc(fx, fy, ps * 0.55, 0, Math.PI * 2); ctx.fillStyle = "#8a5a1a"; ctx.fill();
    }
  }

  // Lily pads are green on purpose and never carry anything round and red,
  // so nothing on the water ever looks like a bobber.
  function lilyPad(ctx, x, y, r0, seed, flower) {
    const pts = [], n = 22;
    for (let i = 0; i < n; i++) { const a = 0.35 + (i / (n - 1)) * (Math.PI * 2 - 0.5); pts.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.42]); }
    pts.push([x, y]);
    wash(ctx, pts, "#5e9f47", { layers: 2, seed, edge: 0.4 });
    line(ctx, () => { for (let i = 0; i < 5; i++) { const a = 0.8 + i * 1.1; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r0 * 0.8, y + Math.sin(a) * r0 * 0.34); } }, 0.8, "#3f6a2a", 0.5);
    ink(ctx, pts, true, 1.2, INK, 0.45);
    if (flower) {
      for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x - r0 * 0.2 + Math.cos(a) * r0 * 0.14, y - r0 * 0.16 + Math.sin(a) * r0 * 0.08, r0 * 0.15, r0 * 0.08, a, 0, Math.PI * 2); ctx.fillStyle = "#f3f0e6"; ctx.fill(); }
      ctx.beginPath(); ctx.arc(x - r0 * 0.2, y - r0 * 0.16, r0 * 0.07, 0, Math.PI * 2); ctx.fillStyle = "#f4d04b"; ctx.fill();
    }
  }

  function cottage(ctx, x, y, s) {
    wash(ctx, [[x - 26 * s, y], [x - 26 * s, y - 22 * s], [x + 26 * s, y - 22 * s], [x + 26 * s, y]], "#f0e2c4", { layers: 2, edge: 0.4 });
    wash(ctx, [[x - 32 * s, y - 20 * s], [x - 18 * s, y - 40 * s], [x + 18 * s, y - 40 * s], [x + 32 * s, y - 20 * s]], "#9a5a3a", { layers: 2, edge: 0.4 });
    wash(ctx, [[x + 10 * s, y - 36 * s], [x + 10 * s, y - 48 * s], [x + 17 * s, y - 48 * s], [x + 17 * s, y - 36 * s]], "#8a6a5a", { layers: 1 });
    wash(ctx, [[x - 4 * s, y], [x - 4 * s, y - 12 * s], [x + 4 * s, y - 12 * s], [x + 4 * s, y]], "#6a4526", { layers: 1 });
    wash(ctx, [[x - 18 * s, y - 8 * s], [x - 18 * s, y - 15 * s], [x - 10 * s, y - 15 * s], [x - 10 * s, y - 8 * s]], "#7fb2c4", { layers: 1 });
    ink(ctx, [[x - 26 * s, y], [x - 26 * s, y - 20 * s], [x - 32 * s, y - 20 * s], [x - 18 * s, y - 40 * s], [x + 18 * s, y - 40 * s], [x + 32 * s, y - 20 * s], [x + 26 * s, y - 20 * s], [x + 26 * s, y]], false, Math.max(0.8, 1.1 * s), INK, 0.7);
    ctx.strokeStyle = "rgba(230,230,230,0.6)"; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x + 13 * s, y - 50 * s); ctx.bezierCurveTo(x + 6 * s, y - 60 * s, x + 22 * s, y - 64 * s, x + 14 * s, y - 76 * s); ctx.stroke();
  }

  function rock(ctx, x, y, rx, ry, seed, col = "#9a9a8e") {
    const pts = blob(x, y, rx, ry, seed, 14, 0.18);
    wash(ctx, pts, col, { layers: 2, edge: 0.35, seed });
    wash(ctx, blob(x - rx * 0.2, y - ry * 0.3, rx * 0.5, ry * 0.35, seed + 2, 10, 0.2), light(col, 0.35), { layers: 1, edge: 0, alpha: 0.6 });
    ink(ctx, pts, true, 1.2, INK, 0.6);
  }

  function hills(ctx, W, baseY, amp, f, seed, col, o = {}) {
    const pts = [];
    for (let x = -20; x <= W + 20; x += 16) pts.push([x, baseY - amp * (0.5 + 0.5 * Math.sin(x * f + seed)) - amp * 0.35 * Math.sin(x * f * 2.7 + seed * 2)]);
    pts.push([W + 20, o.bottom ?? baseY + 40], [-20, o.bottom ?? baseY + 40]);
    wash(ctx, pts, col, { layers: o.layers || 2, edge: o.edge ?? 0.25, seed });
    return pts;
  }

  /* ---------------------------------------------------------------- people */
  const PEOPLE = {
    you:   { skin: "#f1c8a2", shirt: "#e0683f", pants: "#4f6f99", hat: "straw", hatC: "#e8c064", band: "#b8402e", bib: true },
    sam:   { skin: "#c8906a", shirt: "#5f9a4a", pants: "#4a4a58", hat: "cap", hatC: "#3f7cc4" },
    mia:   { skin: "#f4d0b0", shirt: "#8a5ac0", pants: "#2f4a6a", hat: "hair", hatC: "#4a2a18", pack: "#e0a030" },
    penny: { skin: "#e8b890", shirt: "#d8465a", pants: "#3a3a4a", hat: "bun", hatC: "#6a3a1a", apron: "#fff6e0" },
    jack:  { skin: "#e8b89a", shirt: "#5a6e8a", pants: "#5a4a3a", hat: "beanie", hatC: "#b8362a", beard: "#efece4" },
    nana:  { skin: "#f0c8a8", shirt: "#e88aa8", pants: "#7a6aa0", hat: "sunhat", hatC: "#f4e2a8", band: "#e88aa8" },
    kofi:  { skin: "#7a5238", shirt: "#f2f0ea", pants: "#20304a", hat: "captain", hatC: "#20304a" },
  };

  // A painted figure, feet at (0,0), `u` = one hundredth of their height.
  // The rod hand sits at pose.hand (default 20u, -56u), which is where the
  // scene attaches the rod.
  function figure(ctx, who, u, pose = {}) {
    const P = PEOPLE[who] || PEOPLE.you;
    const lw = Math.max(1, 1.8 * u);
    const part = (pts, col) => { wash(ctx, pts, col, { layers: 2, edge: 0.3, seed: Math.round(pts[0][0] * 7 + pts[0][1]) }); ink(ctx, pts, true, lw, INK, 0.85); };
    const sit = !!pose.sit;
    const hand = pose.hand || { x: 20 * u, y: -56 * u };
    const top = (sit ? -76 : -84) * u, bottom = (sit ? -32 : -40) * u;

    if (P.pack) part([[-24 * u, top + 6 * u], [-10 * u, top + 4 * u], [-9 * u, top + 40 * u], [-24 * u, top + 42 * u]], P.pack);

    // legs and boots
    if (sit) {
      part([[-12 * u, -44 * u], [20 * u, -40 * u], [20 * u, -28 * u], [-12 * u, -30 * u]], P.pants);
      part([[10 * u, -34 * u], [19 * u, -34 * u], [16 * u, -2 * u], [8 * u, -2 * u]], P.pants);
      part(blob(15 * u, 0, 9 * u, 4 * u, 5, 12, 0.05), "#5a3a26");
    } else {
      part([[-12 * u, 0], [-12 * u, -44 * u], [12 * u, -44 * u], [13 * u, 0], [3 * u, 0], [1 * u, -20 * u], [-3 * u, 0]], P.pants);
      part(blob(-7 * u, 1 * u, 8 * u, 4 * u, 3, 12, 0.05), "#5a3a26");
      part(blob(8 * u, 1 * u, 8 * u, 4 * u, 4, 12, 0.05), "#5a3a26");
    }

    // body
    part([[-15 * u, bottom], [-16 * u, top + 10 * u], [-6 * u, top], [8 * u, top], [16 * u, top + 12 * u], [14 * u, bottom]], P.shirt);
    if (P.bib) part([[-10 * u, bottom - 2 * u], [-10 * u, top + 22 * u], [-4 * u, top + 22 * u], [-4 * u, top + 10 * u], [2 * u, top + 10 * u], [2 * u, top + 22 * u], [10 * u, top + 22 * u], [10 * u, bottom - 2 * u]], P.pants);
    if (P.apron) part([[-9 * u, bottom + 4 * u], [-9 * u, top + 16 * u], [9 * u, top + 16 * u], [9 * u, bottom + 4 * u]], P.apron);
    if (who === "kofi") { wash(ctx, [[-2 * u, top + 2 * u], [4 * u, top + 2 * u], [4 * u, bottom], [-2 * u, bottom]], "#20304a", { layers: 1, edge: 0 }); }

    // arm reaching to the hand
    const sx = 2 * u, sy = top + 8 * u;
    const ang = Math.atan2(hand.y - sy, hand.x - sx), nx = -Math.sin(ang) * 4.5 * u, ny = Math.cos(ang) * 4.5 * u;
    const arm = [[sx + nx, sy + ny], [hand.x + nx, hand.y + ny], [hand.x - nx, hand.y - ny], [sx - nx, sy - ny]];
    arm.soft = true;
    part(arm, P.shirt);
    part(blob(hand.x, hand.y, 5 * u, 5 * u, 9, 10, 0.05), P.skin);

    // head
    const hy = top - 12 * u;
    part(blob(2 * u, hy, 13 * u, 13 * u, 7, 16, 0.04), P.skin);
    if (P.beard) part([[-9 * u, hy + 2 * u], [13 * u, hy + 2 * u], [10 * u, hy + 16 * u], [1 * u, hy + 22 * u], [-7 * u, hy + 14 * u]], P.beard);
    ctx.beginPath(); ctx.arc(9 * u, hy - 1 * u, Math.max(0.8, 1.7 * u), 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.ellipse(10 * u, hy + 5 * u, 3 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(230,120,100,0.45)"; ctx.fill();
    line(ctx, () => ctx.arc(8 * u, hy + 4 * u, 3.5 * u, 0.3, 1.3), Math.max(0.8, 1.2 * u), "#8a4a3a", 0.8);

    // hats and hair, one silhouette cue each
    switch (P.hat) {
      case "straw":
        part(blob(2 * u, hy - 10 * u, 25 * u, 6 * u, 11, 18, 0.06), P.hatC);
        part([[-10 * u, hy - 10 * u], [-8 * u, hy - 24 * u], [12 * u, hy - 25 * u], [14 * u, hy - 10 * u]], P.hatC);
        wash(ctx, [[-9 * u, hy - 12 * u], [-9 * u, hy - 16 * u], [13 * u, hy - 16 * u], [13 * u, hy - 12 * u]], P.band, { layers: 1, edge: 0 });
        line(ctx, () => { for (let i = 0; i < 6; i++) { ctx.moveTo(-17 * u + i * 7 * u, hy - 8 * u); ctx.lineTo(-15 * u + i * 7 * u, hy - 12 * u); } }, Math.max(0.6, 0.8 * u), "#a07a2a", 0.6);
        break;
      case "cap":
        part([[-12 * u, hy - 4 * u], [-10 * u, hy - 17 * u], [12 * u, hy - 17 * u], [14 * u, hy - 4 * u]], P.hatC);
        part([[10 * u, hy - 6 * u], [28 * u, hy - 4 * u], [26 * u, hy], [10 * u, hy - 2 * u]], dark(P.hatC, 0.15));
        break;
      case "hair":
        part([[-14 * u, hy + 12 * u], [-15 * u, hy - 6 * u], [-6 * u, hy - 15 * u], [10 * u, hy - 14 * u], [15 * u, hy - 4 * u], [4 * u, hy - 8 * u], [-6 * u, hy + 2 * u], [-8 * u, hy + 14 * u]], P.hatC);
        break;
      case "bun":
        part([[-14 * u, hy + 4 * u], [-14 * u, hy - 8 * u], [-4 * u, hy - 15 * u], [10 * u, hy - 14 * u], [15 * u, hy - 4 * u], [2 * u, hy - 8 * u], [-8 * u, hy - 2 * u]], P.hatC);
        part(blob(-6 * u, hy - 18 * u, 7 * u, 6 * u, 13, 12, 0.05), P.hatC);
        break;
      case "beanie":
        part([[-13 * u, hy - 3 * u], [-11 * u, hy - 16 * u], [2 * u, hy - 21 * u], [14 * u, hy - 15 * u], [15 * u, hy - 3 * u]], P.hatC);
        part(blob(2 * u, hy - 23 * u, 4 * u, 4 * u, 17, 10, 0.05), "#f6f0e2");
        break;
      case "sunhat":
        part(blob(2 * u, hy - 9 * u, 26 * u, 6 * u, 19, 18, 0.06), P.hatC);
        part([[-9 * u, hy - 9 * u], [-7 * u, hy - 20 * u], [11 * u, hy - 20 * u], [13 * u, hy - 9 * u]], P.hatC);
        wash(ctx, [[-8 * u, hy - 11 * u], [-8 * u, hy - 14 * u], [12 * u, hy - 14 * u], [12 * u, hy - 11 * u]], P.band, { layers: 1, edge: 0 });
        break;
      case "captain":
        part([[-13 * u, hy - 8 * u], [-12 * u, hy - 20 * u], [14 * u, hy - 20 * u], [15 * u, hy - 8 * u]], P.hatC);
        part([[-14 * u, hy - 6 * u], [16 * u, hy - 6 * u], [16 * u, hy - 10 * u], [-14 * u, hy - 10 * u]], "#f6f2e6");
        ctx.beginPath(); ctx.arc(1 * u, hy - 15 * u, 2.6 * u, 0, Math.PI * 2); ctx.fillStyle = "#e0b43a"; ctx.fill();
        break;
    }
  }

  // People never move their limbs, so each is painted once per size and blitted.
  const people = new Map();
  function personSprite(who, size, sit = false) {
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const s = Math.round(size), key = `${who}|${s}|${sit ? 1 : 0}|${dpr}`;
    let hit = people.get(key);
    if (hit) return hit;
    const u = s / 100, W = Math.ceil(110 * u), H = Math.ceil(140 * u), ox = 50 * u, oy = 130 * u;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    figure(ctx, who, u, { sit });
    hit = { cv, W, H, ox, oy };
    if (people.size > 40) people.clear();     // bounded: a resize can mint new sizes
    people.set(key, hit);
    return hit;
  }
  function drawPerson(ctx, who, x, y, size, sit) {
    const sp = personSprite(who, size, sit);
    ctx.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.W, sp.H);
  }

  /* ---------------------------------------------------------------- fishing furniture */
  function bobber(ctx, x, y, r, under = 0) {
    ctx.save(); ctx.translate(x, y + under * r * 0.8);
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = "#d8402f"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = "#fffaf0"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.4, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.strokeStyle = rgba(INK, 0.95); ctx.lineWidth = Math.max(1.4, r * 0.16); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(-r * 0.12, -r * 1.6, r * 0.24, r * 0.65);
    ctx.restore();
  }

  function splash(ctx, x, y, s, seed) {
    const r = mulberry(seed);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.1 + r() * 0.8), d = (14 + r() * 26) * s;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, (2 + r() * 3) * s, (3 + r() * 4) * s, a, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(240,250,255,0.95)"; ctx.fill(); ctx.strokeStyle = rgba("#2d6a73", 0.5); ctx.lineWidth = 1; ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * (0.05 + (i / 10) * 0.9);
      line(ctx, () => { ctx.moveTo(x + Math.cos(a) * 30 * s, y + Math.sin(a) * 30 * s); ctx.lineTo(x + Math.cos(a) * 44 * s, y + Math.sin(a) * 44 * s); }, 2 * s, "#f4d04b", 0.9);
    }
  }

  // The bite cue: a honey badge with an ink "!". Big, warm, unmistakable.
  function badge(ctx, x, y, r, text = "!") {
    const pts = blob(x, y, r, r, 5, 18, 0.05);
    wash(ctx, pts, "#f0b93f", { layers: 2 });
    ink(ctx, pts, true, Math.max(2, r * 0.1));
    ctx.fillStyle = INK; ctx.font = `${Math.round(r * 1.3)}px Caprasimo, "Cooper Black", Georgia, serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + r * 0.1);
  }

  // A hand-drawn rounded card: a rounded rectangle traced with a faint wobble.
  function card(x0, y0, x1, y1, r, seed) {
    const R = mulberry(seed * 31 + 7), pts = [], w = Math.min(2, r * 0.08);
    const corners = [[x1 - r, y0 + r, -0.5], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 0.5], [x0 + r, y0 + r, 1]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 4; i++) {
        const a = (a0 + i / 8) * Math.PI;
        pts.push([cx + Math.cos(a) * r + (R() - 0.5) * w, cy + Math.sin(a) * r + (R() - 0.5) * w]);
      }
    }
    pts.soft = true;
    return pts;
  }

  // The reel meter as a curved gauge. It shows exactly what the flat meter
  // did — one marker, one green band, two ends — plus landing and strain.
  //
  // Everything is measured before anything is drawn, so the words and bars
  // always sit INSIDE the plate. gaugeLayout() is exported so the scene can
  // keep the whole plate on screen; offsets are relative to the arc centre.
  const GAUGE_FONT = "Nunito, system-ui, sans-serif";
  const STATUS = { loose: "TOO LOOSE — HOLD!", tight: "TOO TIGHT — LET GO!", ok: "KEEP IT IN THE GREEN" };
  function gaugeLayout(ctx, R) {
    const fs = Math.max(12, Math.round(R * 0.16)), bfs = Math.max(11, fs - 1);
    const pad = Math.max(10, Math.round(R * 0.16)), gap = Math.max(10, R * 0.14);
    const bh = Math.max(7, Math.round(R * 0.1));
    ctx.save();
    ctx.font = `900 ${fs}px ${GAUGE_FONT}`;
    const statusW = Math.max(...Object.values(STATUS).map((s) => ctx.measureText(s).width));
    ctx.font = `900 ${bfs}px ${GAUGE_FONT}`;
    const labelW = Math.max(ctx.measureText("🐟 LANDING").width, ctx.measureText("⚠ STRAIN").width);
    ctx.restore();
    const half = Math.ceil(Math.max(R * 1.45, statusW / 2 + pad, labelW + gap / 2 + pad));
    const status = R * 0.36;                        // centre of the warning line
    const barLabel = status + fs * 1.35;             // centre of the bar labels
    const barY = barLabel + bfs * 0.7;               // top of the bars
    return { fs, bfs, pad, gap, bh, half, status, barLabel, barY,
             top: -R * 1.25 - pad, bottom: barY + bh + pad };
  }

  function gauge(ctx, x, y, R, st, t, reduce) {
    const L = gaugeLayout(ctx, R);
    const a0 = Math.PI * 1.1, a1 = Math.PI * 1.9, at = (f) => a0 + (a1 - a0) * f;
    const plate = card(x - L.half, y + L.top, x + L.half, y + L.bottom, Math.min(28, R * 0.3), 9);
    ctx.save(); ctx.shadowColor = "rgba(40,25,10,0.25)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    trace(ctx, plate); ctx.fillStyle = "#fbf1d8"; ctx.fill(); ctx.restore();
    wash(ctx, plate, "#fbf1d8", { layers: 2, edge: 0.3 });
    ink(ctx, plate, true, 2.4);

    const lo = st.c - st.zone / 2, hi = st.c + st.zone / 2;
    ctx.lineCap = "butt";
    ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.strokeStyle = "#efdfbb"; ctx.lineWidth = R * 0.3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R, a0, at(0.1)); ctx.strokeStyle = rgba("#cf4434", 0.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R, at(0.9), a1); ctx.strokeStyle = rgba("#cf4434", 0.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R, at(Math.max(0, lo)), at(Math.min(1, hi))); ctx.strokeStyle = "#6fae44"; ctx.stroke();
    // stripes, so the zone is a pattern and not only a colour
    for (let f = lo + 0.02; f < hi; f += 0.035) {
      const a = at(f);
      line(ctx, () => { ctx.moveTo(x + Math.cos(a) * R * 0.87, y + Math.sin(a) * R * 0.87); ctx.lineTo(x + Math.cos(a + 0.05) * R * 1.13, y + Math.sin(a + 0.05) * R * 1.13); }, Math.max(1.4, R * 0.025), "#ffffff", 0.5);
    }
    ctx.lineCap = "round";
    line(ctx, () => ctx.arc(x, y, R * 1.15, a0, a1), 2.2);
    line(ctx, () => ctx.arc(x, y, R * 0.85, a0, a1), 2.2);
    for (let i = 0; i <= 10; i++) {
      const a = at(i / 10);
      line(ctx, () => { ctx.moveTo(x + Math.cos(a) * R * 1.15, y + Math.sin(a) * R * 1.15); ctx.lineTo(x + Math.cos(a) * R * 1.25, y + Math.sin(a) * R * 1.25); }, 1.4, INK, 0.7);
    }
    const a = at(Math.max(0, Math.min(1, st.p)));
    line(ctx, () => { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * R * 1.12, y + Math.sin(a) * R * 1.12); }, Math.max(3.5, R * 0.06), INK, 1);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 1.12, y + Math.sin(a) * R * 1.12, Math.max(3, R * 0.05), 0, Math.PI * 2); ctx.fillStyle = "#fffaf0"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R * 0.13, 0, Math.PI * 2); ctx.fillStyle = "#b07a3e"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();

    // the two ends, named under the arc; the one you are past turns red
    const flashing = !reduce && Math.sin(t * 14) > 0;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.font = `900 ${L.bfs}px ${GAUGE_FONT}`;
    const endY = y - R * 0.08;
    ctx.fillStyle = st.side < 0 ? "#b8402e" : rgba(INK, 0.6); ctx.fillText("LOOSE", x - R * 1.0, endY);
    ctx.fillStyle = st.side > 0 ? "#b8402e" : rgba(INK, 0.6); ctx.fillText("TIGHT", x + R * 1.0, endY);

    // what to do, in one centred line under the hub
    ctx.font = `900 ${L.fs}px ${GAUGE_FONT}`;
    if (st.side) {
      ctx.fillStyle = flashing ? "#b8402e" : INK;
      ctx.fillText(st.side < 0 ? STATUS.loose : STATUS.tight, x, y + L.status);
    } else {
      ctx.fillStyle = "#2f6a1a"; ctx.fillText(STATUS.ok, x, y + L.status);
    }

    // landing and strain, as two labelled bars across the foot of the plate
    const bw = (L.half - L.pad) - L.gap / 2, by = y + L.barY, bh = L.bh;
    const bar = (bx, label, frac, col) => {
      ctx.font = `900 ${L.bfs}px ${GAUGE_FONT}`; ctx.fillStyle = INK; ctx.textAlign = "left";
      ctx.fillText(label, bx, y + L.barLabel);
      ctx.fillStyle = "#e6d6b2"; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = col; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, frac)), bh);
      ctx.strokeStyle = rgba(INK, 0.8); ctx.lineWidth = 1.4; ctx.strokeRect(bx, by, bw, bh);
    };
    bar(x - L.half + L.pad, "🐟 LANDING", st.prog, "#6fae44");
    bar(x + L.gap / 2, "⚠ STRAIN", st.strain, st.strain > 0.6 && flashing ? "#f0b93f" : "#cf4434");
  }

  /* ---------------------------------------------------------------- small paintings */
  function landscape(ctx, W, H, kind) {
    const P = {
      pond:  { sky: ["#c7e2e4", "#f1ead3"], hill: "#a9c46e", water: ["#8ec1b6", "#3f8a8a"] },
      river: { sky: ["#c2e0ea", "#eef0dc"], hill: "#9cc06a", water: ["#8cc0d4", "#3d7ea0"] },
      lake:  { sky: ["#bcd4ea", "#f3e9d8"], hill: "#8aa2c0", water: ["#7fb0d0", "#2f628c"] },
      pier:  { sky: ["#b9dcea", "#fbecd0"], hill: "#e2cb9c", water: ["#6db6d0", "#1f6f90"] },
      open:  { sky: ["#a6d2ee", "#fde6c4"], hill: "#b9d6ea", water: ["#4f9ad4", "#174f86"] },
      deep:  { sky: ["#1c2548", "#46467e"], hill: "#27335e", water: ["#224070", "#0b1636"] },
    }[kind] || { sky: ["#c7e2e4", "#f1ead3"], hill: "#a9c46e", water: ["#8ec1b6", "#3f8a8a"] };
    const hz = H * 0.46;
    const g = ctx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
    if (kind === "deep") {
      const r = mulberry(8);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,250,220,${0.4 + r() * 0.6})`; ctx.fillRect(r() * W, r() * hz * 0.9, 1.5, 1.5); }
      ctx.beginPath(); ctx.arc(W * 0.78, hz * 0.35, H * 0.07, 0, Math.PI * 2); ctx.fillStyle = "#f4efd2"; ctx.fill();
    } else cloud(ctx, W * 0.55, hz * 0.3, W / 480, 3);
    if (kind === "lake") {
      for (const [fx, fh] of [[0.2, 0.7], [0.5, 1], [0.8, 0.8]]) {
        const x = W * fx, h = hz * 0.7 * fh;
        wash(ctx, [[x - h, hz], [x, hz - h], [x + h, hz]], P.hill, { layers: 2, edge: 0.3 });
        wash(ctx, [[x - h * 0.25, hz - h * 0.75], [x, hz - h], [x + h * 0.25, hz - h * 0.75]], "#fbfbf5", { layers: 1, edge: 0 });
      }
    } else if (kind !== "open" && kind !== "deep") hills(ctx, W, hz - 6, 12, 0.03, W, P.hill, { bottom: hz + 4 });
    if (kind === "pond" || kind === "river" || kind === "lake") {
      const r = mulberry(kind.length);
      for (let i = 0; i < 7; i++) (i % 3 === 0 ? conifer : tree)(ctx, 12 + (i * W) / 7 + r() * 8, hz + 2, (0.38 + r() * 0.12) * W / 220, i + kind.length * 10);
    }
    const wg = ctx.createLinearGradient(0, hz, 0, H); wg.addColorStop(0, P.water[0]); wg.addColorStop(1, P.water[1]);
    if (kind === "river") {
      ctx.fillStyle = "#9cc06a"; ctx.fillRect(0, hz, W, H - hz);
      const riv = [[W * 0.38, hz], [W * 0.52, hz], [W * 0.95, H], [W * 0.1, H]];
      wash(ctx, riv, "#6aaccc", { layers: 2, edge: 0.4 }); ink(ctx, riv, true, 1.2, INK, 0.5);
    } else { ctx.fillStyle = wg; ctx.fillRect(0, hz, W, H - hz); }
    ctx.strokeStyle = kind === "deep" ? "rgba(140,200,255,0.35)" : "rgba(255,255,240,0.45)"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) { const y = hz + 8 + (i * (H - hz)) / 10, x = (i * 53) % W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + i * 2, y); ctx.stroke(); }
    if (kind === "pond") { const d = [[0, H], [0, H * 0.8], [W * 0.4, H * 0.72], [W * 0.5, H]]; shape(ctx, d, "#b27a45", 1.4); lilyPad(ctx, W * 0.75, H * 0.85, W * 0.055, 3, true); }
    if (kind === "pier") {
      shape(ctx, [[W * 0.5, H], [W * 0.62, hz + 10], [W * 0.7, hz + 10], [W * 0.72, H]], "#a57a4e", 1.4);
      const lx = W * 0.15;
      shape(ctx, [[lx - 6, hz + 2], [lx - 4, hz - H * 0.24], [lx + 4, hz - H * 0.24], [lx + 6, hz + 2]], "#fbfbf5", 1.2);
      wash(ctx, [[lx - 5, hz - H * 0.12], [lx - 5, hz - H * 0.17], [lx + 5, hz - H * 0.17], [lx + 5, hz - H * 0.12]], "#cf4434", { layers: 1, edge: 0 });
    }
    if (kind === "open" || kind === "deep") {
      const bx = W * 0.5, by = H * 0.72, k = W / 220;
      shape(ctx, [[bx - 34 * k, by - 6 * k], [bx + 38 * k, by - 6 * k], [bx + 28 * k, by + 8 * k], [bx - 26 * k, by + 8 * k]], kind === "deep" ? "#2a3a4a" : "#e0683f", 1.6);
      if (kind === "deep") {
        shape(ctx, [[bx - 26 * k, by - 6 * k], [bx - 26 * k, by - 22 * k], [bx - 6 * k, by - 22 * k], [bx - 6 * k, by - 6 * k]], "#f2efe6", 1.2);
        ctx.beginPath(); ctx.arc(bx - 16 * k, by - 28 * k, 2.5 * k, 0, Math.PI * 2); ctx.fillStyle = "#ffd98a"; ctx.fill();
      } else {
        line(ctx, () => { ctx.moveTo(bx, by - 6 * k); ctx.lineTo(bx, by - 40 * k); }, 2);
        shape(ctx, [[bx + 2 * k, by - 38 * k], [bx + 24 * k, by - 10 * k], [bx + 2 * k, by - 10 * k]], "#fffaf0", 1.2);
      }
    }
    grainOver(ctx, W, H, 0.35);
  }

  function logo(ctx, W, H) {
    const k = W / 500;
    ctx.save(); ctx.scale(k, H / 380);
    const board = [[40, 90], [250, 60], [470, 92], [482, 290], [260, 316], [26, 292]];
    wash(ctx, board, "#b88150", { layers: 3, edge: 0.5, seed: 12 });
    ctx.save(); trace(ctx, board); ctx.clip(); ctx.globalAlpha = 0.55; ctx.drawImage(wood(), 0, 40, 600, 300); ctx.restore();
    ink(ctx, board, true, 4);
    ink(ctx, [[56, 104], [250, 78], [456, 106], [466, 276], [260, 300], [42, 278]], true, 1.6, "#6e4424", 0.6);
    if (typeof Art !== "undefined" && typeof CATCH !== "undefined") {
      ctx.save(); ctx.translate(250, 44); Art.drawCatch(ctx, CATCH.rainbow_trout, 110); ctx.restore();
    }
    conifer(ctx, 44, 110, 1.2, 4); tree(ctx, 468, 300, 0.9, 8, "#6f9a3e");
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    const word = (txt, x, y, size, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.font = `${size}px Caprasimo, "Cooper Black", Georgia, serif`;
      ctx.lineJoin = "round"; ctx.strokeStyle = "#3a2616"; ctx.lineWidth = size * 0.2; ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = "#fbe9c0"; ctx.fillText(txt, 0, -size * 0.04);
      ctx.restore();
    };
    word("Fishing", 250, 175, 88, -0.05);
    word("Tycoon", 262, 256, 80, -0.03);
    const rib = [[80, 300], [440, 290], [446, 340], [84, 352]];
    shape(ctx, rib, "#fff1d0", 2.4);
    ctx.save(); ctx.translate(262, 330); ctx.rotate(-0.025);
    ctx.font = "700 30px Caveat, cursive"; ctx.fillStyle = INK; ctx.fillText("A small pond… big dreams.", 0, 0);
    ctx.restore();
    ctx.restore();
    grainOver(ctx, W, H, 0.22);
  }

  // Painted icons for the control bar and a few hero places.
  function icon(ctx, name, S) {
    const f = S / 96;
    switch (name) {
      case "shop": {
        const w = [[20 * f, 84 * f], [20 * f, 44 * f], [76 * f, 44 * f], [76 * f, 84 * f]];
        shape(ctx, w, "#f2e3c3", 2 * f);
        for (let i = 0; i < 5; i++) wash(ctx, [[14 * f + i * 13.6 * f, 26 * f], [27.6 * f + i * 13.6 * f, 26 * f], [27.6 * f + i * 13.6 * f, 46 * f], [14 * f + i * 13.6 * f, 46 * f]], i % 2 ? "#fbf3df" : "#d9483b", { layers: 1, edge: 0 });
        ink(ctx, [[14 * f, 26 * f], [82 * f, 26 * f], [82 * f, 46 * f], [14 * f, 46 * f]], true, 2 * f);
        shape(ctx, [[40 * f, 84 * f], [40 * f, 60 * f], [56 * f, 60 * f], [56 * f, 84 * f]], "#8a5a30", 1.6 * f);
        line(ctx, () => { ctx.moveTo(12 * f, 20 * f); ctx.lineTo(84 * f, 20 * f); }, 3 * f, "#6e4424", 1);
        break;
      }
      case "journal": {
        const ox = 48 * f, oy = 50 * f;
        wash(ctx, [[ox - 40 * f, oy - 20 * f], [ox, oy - 12 * f], [ox + 40 * f, oy - 20 * f], [ox + 40 * f, oy + 28 * f], [ox, oy + 36 * f], [ox - 40 * f, oy + 28 * f]], "#3f6f8a", { layers: 2 });
        for (const p of [[[ox - 36 * f, oy - 24 * f], [ox, oy - 17 * f], [ox, oy + 28 * f], [ox - 36 * f, oy + 21 * f]], [[ox, oy - 17 * f], [ox + 36 * f, oy - 24 * f], [ox + 36 * f, oy + 21 * f], [ox, oy + 28 * f]]]) shape(ctx, p, "#fbf3df", 1.8 * f);
        line(ctx, () => { for (let i = 0; i < 3; i++) { ctx.moveTo(ox - 28 * f, oy - 8 * f + i * 10 * f); ctx.lineTo(ox - 7 * f, oy - 4 * f + i * 10 * f); } }, 1.4 * f, INK, 0.4);
        if (typeof Art !== "undefined") { ctx.save(); ctx.translate(ox + 18 * f, oy + 2 * f); Art.drawCatch(ctx, CATCH.trout, 30 * f); ctx.restore(); }
        break;
      }
      case "haul": {
        const b = [[16 * f, 82 * f], [22 * f, 44 * f], [74 * f, 44 * f], [80 * f, 82 * f]];
        shape(ctx, b, "#c89a5a", 2 * f);
        line(ctx, () => { for (let i = 0; i < 4; i++) { ctx.moveTo(18 * f + i * 2 * f, 52 * f + i * 9 * f); ctx.lineTo(78 * f - i * 2 * f, 52 * f + i * 9 * f); } for (let i = 0; i < 6; i++) { ctx.moveTo(26 * f + i * 9 * f, 46 * f); ctx.lineTo(24 * f + i * 10 * f, 80 * f); } }, 1.2 * f, "#7a5230", 0.6);
        line(ctx, () => ctx.arc(48 * f, 46 * f, 24 * f, Math.PI, 0), 4 * f, "#7a5230", 0.9);
        wash(ctx, [[34 * f, 44 * f], [40 * f, 28 * f], [46 * f, 44 * f]], "#8fa7b3", { layers: 1 });
        wash(ctx, [[52 * f, 44 * f], [60 * f, 30 * f], [64 * f, 44 * f]], "#e0a526", { layers: 1 });
        break;
      }
      case "business": {
        for (let i = 0; i < 3; i++) shape(ctx, [[22 * f + i * 20 * f, 82 * f], [22 * f + i * 20 * f, (62 - i * 16) * f], [36 * f + i * 20 * f, (62 - i * 16) * f], [36 * f + i * 20 * f, 82 * f]], ["#6fae44", "#e9b53a", "#3f8fc4"][i], 1.6 * f);
        line(ctx, () => { ctx.moveTo(14 * f, 82 * f); ctx.lineTo(82 * f, 82 * f); ctx.moveTo(18 * f, 56 * f); ctx.lineTo(44 * f, 40 * f); ctx.lineTo(56 * f, 46 * f); ctx.lineTo(80 * f, 18 * f); }, 2.6 * f, "#cf4434", 1);
        break;
      }
      case "coin": {
        const r = 36 * f, d = blob(48 * f, 48 * f, r, r, 3, 18, 0.03);
        wash(ctx, d, "#e9b53a", { layers: 2, edge: 0.4 }); ink(ctx, d, true, 2.4 * f);
        line(ctx, () => ctx.arc(48 * f, 48 * f, r * 0.72, 0, Math.PI * 2), 1.4 * f, "#8a5a10", 0.7);
        ctx.fillStyle = "#7a4a08"; ctx.font = `${Math.round(r * 1.05)}px Caprasimo, Georgia, serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 48 * f, 51 * f);
        break;
      }
      case "rodmark": {
        line(ctx, () => { ctx.moveTo(22 * f, 70 * f); ctx.quadraticCurveTo(48 * f, 40 * f, 76 * f, 16 * f); }, 7 * f, "#3a2616");
        line(ctx, () => { ctx.moveTo(22 * f, 70 * f); ctx.quadraticCurveTo(48 * f, 40 * f, 76 * f, 16 * f); }, 3.6 * f, "#b07a3e");
        line(ctx, () => { ctx.moveTo(76 * f, 16 * f); ctx.lineTo(76 * f, 54 * f); ctx.arc(70 * f, 54 * f, 6 * f, 0, Math.PI); }, 2 * f, "#6f7a88");
        ctx.beginPath(); ctx.arc(34 * f, 62 * f, 6 * f, 0, Math.PI * 2); ctx.fillStyle = "#c9ccd2"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * f; ctx.stroke();
        break;
      }
      case "rod": case "reel": case "line": case "tackle": {
        wash(ctx, blob(48 * f, 50 * f, 40 * f, 38 * f, name.length, 22, 0.05), "#e6efd9", { layers: 2, edge: 0.2 });
        if (name === "rod") {
          line(ctx, () => { ctx.moveTo(22 * f, 82 * f); ctx.quadraticCurveTo(48 * f, 54 * f, 76 * f, 16 * f); }, 7 * f, "#3a2616");
          line(ctx, () => { ctx.moveTo(22 * f, 82 * f); ctx.quadraticCurveTo(48 * f, 54 * f, 76 * f, 16 * f); }, 3.6 * f, "#e8b43a");
          ctx.beginPath(); ctx.arc(36 * f, 70 * f, 7 * f, 0, Math.PI * 2); ctx.fillStyle = "#c9ccd2"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * f; ctx.stroke();
        } else if (name === "reel") {
          shape(ctx, blob(48 * f, 52 * f, 22 * f, 22 * f, 5, 20, 0.02), "#b9bec6", 2 * f);
          line(ctx, () => ctx.arc(48 * f, 52 * f, 13 * f, 0, Math.PI * 2), 1.6 * f, INK, 0.6);
          line(ctx, () => { ctx.moveTo(48 * f, 52 * f); ctx.lineTo(74 * f, 34 * f); }, 4 * f, INK);
          ctx.beginPath(); ctx.ellipse(77 * f, 31 * f, 6 * f, 4 * f, -0.5, 0, Math.PI * 2); ctx.fillStyle = "#8a5a30"; ctx.fill(); ctx.stroke();
        } else if (name === "line") {
          shape(ctx, [[28 * f, 36 * f], [68 * f, 36 * f], [68 * f, 70 * f], [28 * f, 70 * f]], "#e9dcc0", 1.8 * f);
          line(ctx, () => { for (let i = 0; i < 6; i++) { ctx.moveTo(29 * f, 40 * f + i * 5.5 * f); ctx.lineTo(67 * f, 39 * f + i * 5.5 * f); } }, 1.1 * f, "#5f9a7a", 0.8);
          for (const y of [32, 74]) shape(ctx, blob(48 * f, y * f, 25 * f, 5.5 * f, y, 16, 0.02), "#8a8f98", 1.4 * f);
          line(ctx, () => { ctx.moveTo(68 * f, 48 * f); ctx.bezierCurveTo(84 * f, 54 * f, 76 * f, 78 * f, 86 * f, 84 * f); }, 1.4 * f, "#5f9a7a");
        } else {
          shape(ctx, [[20 * f, 78 * f], [20 * f, 46 * f], [76 * f, 46 * f], [76 * f, 78 * f]], "#4f8a8a", 2 * f);
          shape(ctx, [[16 * f, 48 * f], [26 * f, 32 * f], [70 * f, 32 * f], [80 * f, 48 * f]], "#78b0ac", 2 * f);
          shape(ctx, [[42 * f, 54 * f], [42 * f, 42 * f], [54 * f, 42 * f], [54 * f, 54 * f]], "#e9b53a", 1.4 * f);
        }
        break;
      }
    }
  }

  function mount(root = document) {
    for (const cv of root.querySelectorAll("canvas[data-icon]")) {
      const r = cv.getBoundingClientRect();
      const css = Math.max(24, r.width || +cv.dataset.size || 48);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(css * dpr);
      if (cv.width === px && cv.dataset.painted === "1") continue;
      cv.width = cv.height = px;
      const ctx = cv.getContext("2d");
      ctx.setTransform(px / 96, 0, 0, px / 96, 0, 0);
      icon(ctx, cv.dataset.icon, 96);
      cv.dataset.painted = "1";
    }
  }

  return {
    INK, mulberry, rgba, mix, dark, light, penFor,
    blob, trace, wash, ink, line, shape, dabs, star,
    paper, grain, wood, installTextures, grainOver,
    GREENS, tree, conifer, cloud, reed, grassTuft, flowers, lilyPad, cottage, rock, hills,
    PEOPLE, figure, personSprite, drawPerson,
    bobber, splash, badge, gauge, gaugeLayout, card,
    landscape, logo, icon, mount,
  };
})();
