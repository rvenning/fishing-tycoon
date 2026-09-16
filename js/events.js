// Temporary fishing events. All local, all free — they just happen while you
// fish. js/game.js reads `mods` when it rolls a catch or prices a sale.
//
//   dur      seconds of real fishing time the event lasts (casts for `casts`)
//   weight   how often it is picked when an event is due
//   minLoc   earliest location index it can happen at (a competition at the
//            pond on your first minute would just be confusing)
//   mods     luck (x), rare (x on rare-and-up), odd (x on oddities),
//            gold (chance a fish is golden), sell (x), fight (+), wait (x),
//            legend (next catch is this location's legendary)

const EVENTS = [
  { id: "golden", name: "Golden Hour", emoji: "✨", dur: 75, weight: 3, minCatches: 12,
    blurb: "The water's gone gold! Golden fish are everywhere — worth five times as much.",
    mods: { gold: 0.22 } },
  { id: "storm", name: "Storm", emoji: "⛈️", dur: 90, weight: 3, minCatches: 30,
    blurb: "Rain's coming in! Fish bite fast and rare ones come up — but they fight hard.",
    mods: { rare: 2.2, wait: 0.6, fight: 0.14 } },
  { id: "lucky", name: "Lucky Day", emoji: "🍀", dur: 90, weight: 3, minCatches: 20,
    blurb: "Market's buzzing! Everything sells for 50% more while it lasts.",
    mods: { sell: 1.5 } },
  { id: "ripple", name: "Mysterious Ripple", emoji: "🌀", casts: 6, weight: 2, minCatches: 40,
    blurb: "Something strange is stirring the water… odd things are rising.",
    mods: { odd: 7, ripple: true } },
  { id: "comp", name: "Fishing Competition", emoji: "🏆", dur: 150, weight: 2, minCatches: 50, minLoc: 1,
    blurb: "Biggest fish wins! Land the heaviest catch you can before time's up.",
    mods: {} },
  { id: "shadow", name: "A Huge Shadow", emoji: "👀", casts: 1, weight: 1, minCatches: 80,
    blurb: "Something enormous is circling your line. Cast — carefully.",
    mods: { legend: true, fight: 0.1 } },
];

const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// Competition medal thresholds, as a fraction of the heaviest thing (by kg)
// that commonly lives at the location. Reaching gold means landing something
// properly big for that water during the window.
const COMP_MEDALS = [
  { id: "gold", name: "Gold", emoji: "🥇", frac: 0.85, prize: 1.0 },
  { id: "silver", name: "Silver", emoji: "🥈", frac: 0.55, prize: 0.45 },
  { id: "bronze", name: "Bronze", emoji: "🥉", frac: 0.28, prize: 0.2 },
];
