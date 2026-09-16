// Active $/min and catch mix at each location for a given gear state.
const { loadEngine, mulberry } = require("../tests/load.js");
const G = loadEngine(); const E = G.Econ; const rand = mulberry(3);
function rate(setup, loc, n = 3000) {
  const s = E.blank(); setup(s); s.locs[loc] = 1; s.loc = loc;
  let val = 0, secs = 0, landed = 0;
  for (let i = 0; i < n; i++) {
    const f = E.rollCatch(s, rand, null);
    const p = E.reelParams(s, f, null, false);
    const r = G.playReel(p, rand, G.reelBrain({ react: 0.28, slop: 0.4, rand }));
    secs += 0.9 + E.waitTime(s, rand, null) + 0.65 + r.t + (r.done === "landed" ? 1.1 : 0);
    if (r.done === "landed") { landed++; val += Math.round(f.val * E.mods(s).sell); }
  }
  return { perMin: Math.round(val / secs * 60), land: Math.round(landed / n * 100), avg: Math.round(val / landed), secPer: (secs / n).toFixed(1) };
}
const stages = {
  basic: (s) => {},
  early: (s) => { s.own.rod = 2; s.own.reel = 2; s.own.line = 2; s.own.minnows = 1; s.bait = "minnows"; },
  mid: (s) => { s.own.rod = 3; s.own.reel = 3; s.own.line = 3; s.own.lures = 1; s.bait = "lures"; s.own.penny = 2; s.own.mia = 2; },
  late: (s) => { s.own.rod = 4; s.own.reel = 4; s.own.line = 4; s.own.premium = 1; s.bait = "premium"; s.own.penny = 3; s.own.mia = 3; s.own.jack = 2; s.own.market = 1; },
  end: (s) => { for (const t of G.TRACKS) s.own[t.id] = t.levels.length; s.bait = "deepbait"; },
};
for (const l of G.LOCATIONS) {
  console.log(l.id, Object.entries(stages).map(([k, f]) => { const r = rate(f, l.id); return `${k}: $${r.perMin}/min ${r.land}% avg$${r.avg} ${r.secPer}s`; }).join(" | "));
}
