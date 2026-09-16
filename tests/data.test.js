// Content linter: every catch, location, track, goal and event is well formed,
// and every cross-reference points at something that exists. A typo in an id
// fails silently in a data-driven game — a need that names a missing track can
// never be met, and nothing on screen says why.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, readSource } = require("./load.js");

const G = loadEngine();
const ART_KINDS = new Set(["fish", "boot", "duck", "rod", "key", "gnome", "squid", "crab", "lobster", "bottle", "turtle", "chest", "coin", "fossil", "relic", "jelly"]);

test("catch ids are unique and every catch is well formed", () => {
  const fails = [];
  const seen = new Set();
  for (const c of G.CATCHES) {
    if (seen.has(c.id)) fails.push(`${c.id}: duplicate id`);
    seen.add(c.id);
    if (!G.LOCATION[c.loc]) fails.push(`${c.id}: unknown location ${c.loc}`);
    if (!G.RARITY[c.rarity]) fails.push(`${c.id}: unknown rarity ${c.rarity}`);
    if (!(c.kg[0] > 0 && c.kg[1] > c.kg[0])) fails.push(`${c.id}: bad size range`);
    if (!(c.value > 0)) fails.push(`${c.id}: no value`);
    if (!c.desc || c.desc.length < 12) fails.push(`${c.id}: needs a description with personality`);
    if (!c.art || !ART_KINDS.has(c.art.k)) fails.push(`${c.id}: unknown art kind`);
  }
  assert.deepEqual(fails, []);
});

test("the catalogue is substantial and every location has every rarity", () => {
  assert.ok(G.CATCHES.length >= 42, `only ${G.CATCHES.length} catches`);
  const fails = [];
  for (const l of G.LOCATIONS) {
    const here = G.CATCHES.filter((c) => c.loc === l.id);
    if (here.length < 7) fails.push(`${l.id}: only ${here.length} catches`);
    for (const r of G.RARITY_ORDER) if (!here.some((c) => c.rarity === r)) fails.push(`${l.id}: no ${r}`);
  }
  assert.deepEqual(fails, []);
});

test("the spec's named catches are all in the game", () => {
  const names = new Set(G.CATCHES.map((c) => c.name));
  const wanted = ["Minnow", "Perch", "Bluegill", "Carp", "Trout", "Bass", "Golden Trout", "Old Boot",
    "Salmon", "Pike", "Catfish", "Rainbow Trout", "River Eel", "Largemouth Bass", "Northern Pike", "Giant Carp",
    "Lake Trout", "Sturgeon", "Mackerel", "Snapper", "Flathead", "Squid", "Crab", "Lobster", "Message in a Bottle",
    "Tuna", "Swordfish", "Marlin", "Mahi-Mahi", "Barracuda", "Sea Turtle", "Treasure Chest", "Giant Squid",
    "Anglerfish", "Deep-Sea Eel", "Lanternfish", "Ancient Fish", "Fossil", "Pirate Coin", "Rubber Duck",
    "Lost Fishing Rod", "Mysterious Key", "Ancient Relic"];
  assert.deepEqual(wanted.filter((n) => !names.has(n)), []);
});

test("locations get dearer in order and their needs exist", () => {
  const fails = [];
  G.LOCATIONS.forEach((l, i) => {
    if (i > 0 && l.cost <= G.LOCATIONS[i - 1].cost) fails.push(`${l.id}: not dearer than the one before`);
    for (const k of Object.keys(l.needs)) if (!G.TRACK[k] && !G.LOCATION[k]) fails.push(`${l.id}: needs unknown ${k}`);
  });
  assert.deepEqual(fails, []);
});

test("every track's levels get dearer and every need can be met", () => {
  const fails = [];
  for (const t of G.TRACKS) {
    if (!G.SHOP_TABS.some((tab) => tab.id === t.cat)) fails.push(`${t.id}: no shop tab ${t.cat}`);
    t.levels.forEach((lv, i) => {
      if (i >= (t.start || 0) && i > 0 && lv.cost <= t.levels[i - 1].cost) fails.push(`${t.id} level ${i + 1}: not dearer`);
      for (const [k, n] of Object.entries(lv.needs || {})) {
        if (G.LOCATION[k]) continue;
        if (!G.TRACK[k]) fails.push(`${t.id} level ${i + 1}: needs unknown ${k}`);
        else if (G.TRACK[k].levels.length < n) fails.push(`${t.id} level ${i + 1}: needs ${k} ${n}, which doesn't exist`);
      }
    });
  }
  assert.deepEqual(fails, []);
});

test("goal and event ids are unique, goals all have rewards", () => {
  const ids = G.GOALS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  const fails = [...G.GOALS.filter((g) => !(g.need > 0) || !(g.reward.cash > 0 || g.reward.bait)).map((g) => g.id)];
  assert.deepEqual(fails, []);
  const evs = G.EVENTS.map((e) => e.id);
  assert.equal(new Set(evs).size, evs.length);
  for (const g of G.GOALS) if (g.reward.bait) assert.ok(G.TRACK[g.reward.bait] && G.TRACK[g.reward.bait].bait, g.id);
});

test("the rules files never roll their own dice", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const f of ["js/game.js", "js/reel.js", "js/fishing.js"]) {
    assert.ok(!/Math\.random\s*\(/.test(strip(readSource(f))), `${f} calls Math.random`);
    assert.ok(!/document\.|window\./.test(strip(readSource(f))), `${f} touches the DOM`);
  }
});
