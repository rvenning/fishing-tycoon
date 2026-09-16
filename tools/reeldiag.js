// Land rates for the reeling mini-game across fight levels and brains.
const { loadEngine, mulberry } = require("../tests/load.js");
const G = loadEngine();
const rand = mulberry(7);
const brains = { sharp: { react: 0.12, slop: 0.15 }, kid: { react: 0.28, slop: 0.4 }, sloppy: { react: 0.45, slop: 0.7 } };
const s = G.Econ.blank();
for (const reelLv of [1, 3, 5]) {
  s.own.reel = reelLv;
  for (const assist of [false, true]) {
    const rows = [];
    for (const d of [0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.1]) {
      const row = [d];
      for (const [name, b] of Object.entries(brains)) {
        let ok = 0, tsum = 0; const N = 300;
        for (let i = 0; i < N; i++) {
          const p = G.Econ.reelParams(s, { fight: d }, null, assist);
          const r = G.playReel(p, rand, G.reelBrain({ ...b, rand }));
          if (r.done === "landed") { ok++; tsum += r.t; }
        }
        row.push(`${name} ${(ok / N * 100).toFixed(0)}% ${(tsum / Math.max(1, ok)).toFixed(1)}s`);
      }
      rows.push(row.join(" | "));
    }
    console.log(`reel ${reelLv} assist ${assist}\n  ` + rows.join("\n  "));
  }
}
