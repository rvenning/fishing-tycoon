// The rules: catching, sizes, selling, buying, prerequisites, capacity,
// passive and offline income, discovery and locations.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, mulberry } = require("./load.js");

const G = loadEngine();
const E = G.Econ;

const fresh = () => E.blank();
const maxed = () => {
  const s = E.blank();
  for (const t of G.TRACKS) s.own[t.id] = t.levels.length;
  for (const l of G.LOCATIONS) s.locs[l.id] = 1;
  s.bait = "deepbait";
  return s;
};
const byRarity = (s, loc, ev) => {
  const odds = E.odds(s, loc, ev);
  const out = Object.fromEntries(G.RARITY_ORDER.map((r) => [r, 0]));
  for (const [id, p] of Object.entries(odds)) out[G.CATCH[id].rarity] += p;
  return out;
};

/* ---------------- catch probability ---------------- */

test("catch odds are a probability distribution over that location only", () => {
  for (const l of G.LOCATIONS) {
    const odds = E.odds(fresh(), l.id);
    const total = Object.values(odds).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, l.id);
    for (const id of Object.keys(odds)) assert.equal(G.CATCH[id].loc, l.id);
  }
});

test("rarer means less likely, with basic gear, everywhere", () => {
  const fails = [];
  for (const l of G.LOCATIONS) {
    const r = byRarity(fresh(), l.id);
    for (let i = 1; i < G.RARITY_ORDER.length; i++) {
      const a = G.RARITY_ORDER[i - 1], b = G.RARITY_ORDER[i];
      if (!(r[a] > r[b])) fails.push(`${l.id}: ${a} ${r[a].toFixed(3)} <= ${b} ${r[b].toFixed(3)}`);
    }
  }
  assert.deepEqual(fails, []);
});

test("rare fish are never effectively impossible", () => {
  // With starting gear a legendary is still findable; with good gear it is a regular treat.
  const fails = [];
  for (const l of G.LOCATIONS) {
    const low = byRarity(fresh(), l.id).legendary, high = byRarity(maxed(), l.id).legendary;
    if (low < 0.001) fails.push(`${l.id}: basic legendary ${low}`);
    if (high < 0.01) fails.push(`${l.id}: best-gear legendary ${high}`);
    if (high > 0.2) fails.push(`${l.id}: best-gear legendary too common ${high}`);
  }
  assert.deepEqual(fails, []);
});

test("every rod upgrade raises the rare-and-up share", () => {
  const s = fresh();
  let last = 0;
  for (let n = 1; n <= G.TRACK.rod.levels.length; n++) {
    s.own.rod = n;
    const r = byRarity(s, "river");
    const share = r.rare + r.veryrare + r.legendary;
    assert.ok(share > last, `rod ${n}: ${share} <= ${last}`);
    last = share;
  }
});

test("bait and helpers change the odds the way their cards say", () => {
  const oddShare = (s) => Object.entries(E.odds(s, "pond")).filter(([id]) => G.CATCH[id].odd).reduce((a, [, p]) => a + p, 0);
  const s = fresh();
  const base = oddShare(s);
  s.own.magnet = 1; s.bait = "magnet";
  assert.ok(oddShare(s) > base * 2, "magnet bait brings up odd things");

  const t = fresh();
  const u0 = byRarity(t, "pond").uncommon;
  t.own.minnows = 1; t.bait = "minnows";
  const u1 = byRarity(t, "pond").uncommon;
  assert.ok(u1 > u0, "minnows raise uncommons");
  t.own.mia = 3;
  assert.ok(byRarity(t, "pond").uncommon > u1, "Mia makes bait work harder");

  const j = fresh();
  const r0 = byRarity(j, "lake").rare;
  j.own.jack = 2;
  assert.ok(byRarity(j, "lake").rare > r0, "Old Jack finds rare fish");
});

test("events bend the odds: storm, ripple and the huge shadow", () => {
  const s = fresh();
  const calm = byRarity(s, "river"), storm = byRarity(s, "river", G.EVENT.storm);
  assert.ok(storm.rare > calm.rare);
  const key = (ev) => E.odds(s, "river", ev).mystery_key;
  assert.ok(key(G.EVENT.ripple) > key(null) * 10, "the ripple brings up ripple-only oddities");
  const shadow = byRarity(s, "pier", G.EVENT.shadow);
  assert.ok(Math.abs(shadow.legendary - 1) < 1e-9, "the huge shadow is always the legendary");
});

/* ---------------- fish generation and size ---------------- */

test("rolled catches are valid, sized within range and priced", () => {
  const rand = mulberry(11);
  const fails = [];
  for (const l of G.LOCATIONS) {
    const s = fresh(); s.loc = l.id; s.locs[l.id] = 1;
    for (let i = 0; i < 1500; i++) {
      const f = E.rollCatch(s, rand, null);
      const c = G.CATCH[f.id];
      if (c.loc !== l.id) fails.push(`${f.id} at ${l.id}`);
      if (!(f.kg >= c.kg[0] - 1e-6 && f.kg <= c.kg[1] + 1e-6)) fails.push(`${f.id} ${f.kg}kg out of range`);
      if (!(f.val >= 1) || !Number.isInteger(f.val)) fails.push(`${f.id} bad value ${f.val}`);
      if (f.gold && c.odd) fails.push(`${f.id} golden oddity`);
      if (!(f.fight > 0)) fails.push(`${f.id} no fight`);
      if (fails.length > 10) break;
    }
  }
  assert.deepEqual(fails, []);
});

test("bigger fish are worth more, golden fish five times more", () => {
  const c = G.CATCH.perch;
  assert.ok(E.priceFor(c, 3.7, false) > E.priceFor(c, 1.2, false) * 1.6);
  assert.equal(E.priceFor(c, 2, true), Math.round(G.CATCH.perch.value * (0.45 + 0.55 * 2 / G.catchMid(c)) * 5));
});

test("a better rod lands bigger fish on average", () => {
  const mean = (rod) => {
    const s = fresh(); s.own.rod = rod;
    const m = E.mods(s), rand = mulberry(5);
    let t = 0;
    for (let i = 0; i < 4000; i++) t += E.sizeFrac(m, rand);
    return t / 4000;
  };
  assert.ok(mean(4) > mean(1) + 0.1);
});

test("golden fish turn up far more in Golden Hour", () => {
  const count = (ev) => {
    const s = fresh(), rand = mulberry(9);
    let n = 0;
    for (let i = 0; i < 3000; i++) if (E.rollCatch(s, rand, ev).gold) n++;
    return n;
  };
  assert.ok(count(G.EVENT.golden) > count(null) * 10);
});

/* ---------------- haul, capacity and selling ---------------- */

test("the haul holds exactly its capacity; a turtle is released, not stored", () => {
  const s = fresh();
  const cap = E.capacity(s);
  for (let i = 0; i < cap + 3; i++) E.land(s, { id: "perch", kg: 1, val: 7, gold: false });
  assert.equal(s.haul.length, cap);
  assert.ok(E.isFull(s));
  s.own.tackle = 3;
  assert.ok(!E.isFull(s), "a bigger box makes room");
  const before = E.cash(s);
  const out = E.land(s, { id: "sea_turtle", kg: 50, val: 3000, gold: false });
  assert.ok(out.released > 0 && !out.stored);
  assert.equal(E.cash(s), before + out.released);
});

test("selling pays the receipt total, empties the haul and applies bonuses", () => {
  const s = fresh();
  E.land(s, { id: "perch", kg: 1, val: 7, gold: false });
  E.land(s, { id: "perch", kg: 2, val: 10, gold: false });
  E.land(s, { id: "old_boot", kg: 1, val: 2, gold: false });
  const lines = E.haulLines(s);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.id === "perch").n, 2);
  const cash = E.cash(s);
  const r = E.sell(s);
  assert.equal(r.total, 19);
  assert.equal(E.cash(s), cash + 19);
  assert.equal(s.haul.length, 0);
  assert.equal(s.stats.sales, 1);
  assert.equal(E.sell(s).total, 0, "selling nothing does nothing");

  const p = fresh();
  p.own.penny = 1;
  E.land(p, { id: "carp", kg: 5, val: 100, gold: false });
  assert.equal(E.haulValue(p), 110);
  assert.equal(E.haulValue(p, G.EVENT.lucky), 165, "Lucky Day stacks");
});

/* ---------------- buying and prerequisites ---------------- */

test("buying: not enough money, success, and a fully upgraded track", () => {
  const s = fresh();
  const r0 = E.buy(s, "rod");
  assert.equal(r0.ok, false); assert.equal(r0.reason, "cash");
  assert.equal(r0.short, G.TRACK.rod.levels[1].cost - E.cash(s));
  E.earn(s, 1e9);
  const cash = E.cash(s);
  const r1 = E.buy(s, "rod");
  assert.equal(r1.ok, true);
  assert.equal(s.own.rod, 2);
  assert.equal(E.cash(s), cash - G.TRACK.rod.levels[1].cost);
  s.own.rod = G.TRACK.rod.levels.length;
  assert.equal(E.buy(s, "rod").reason, "max");
});

test("prerequisites block a purchase and say what is missing", () => {
  const s = fresh();
  E.earn(s, 1e9);
  const r = E.buy(s, "fishingboat");
  assert.equal(r.reason, "locked");
  assert.deepEqual([...r.unmet], ["Small Boat"]);
  assert.ok(E.buy(s, "smallboat").ok);
  assert.ok(E.buy(s, "fishingboat").ok);
  const rod = E.check(s, "rod");
  assert.ok(rod.ok);
  s.own.rod = 4;
  assert.deepEqual([...E.check(s, "rod").unmet], ["Unlock Open Sea"]);
});

test("buying bait puts it on the hook, and only owned bait can be chosen", () => {
  const s = fresh();
  assert.equal(E.selectBait(s, "lures"), false);
  E.earn(s, 1e6);
  E.buy(s, "lures");
  assert.equal(s.bait, "lures");
  assert.equal(E.selectBait(s, "worms"), true);
  assert.equal(s.bait, "worms");
});

/* ---------------- locations ---------------- */

test("locations unlock in order of their needs and cost, and you can only travel to owned ones", () => {
  const s = fresh();
  assert.equal(E.travel(s, "river"), false);
  assert.equal(E.unlock(s, "river").reason, "cash");
  E.earn(s, 1e8);
  assert.equal(E.unlock(s, "lake").reason, "locked");
  assert.ok(E.unlock(s, "river").ok);
  assert.equal(s.loc, "river");
  E.buy(s, "line");
  assert.ok(E.unlock(s, "lake").ok);
  assert.equal(E.unlock(s, "lake").reason, "owned");
  assert.equal(E.unlock(s, "open").reason, "locked");
  assert.ok(E.travel(s, "pond"));
});

/* ---------------- discovery ---------------- */

test("the journal records discoveries and personal bests", () => {
  const s = fresh();
  const a = E.land(s, { id: "perch", kg: 1.2, val: 8, gold: false });
  assert.equal(a.isNew, true);
  const b = E.land(s, { id: "perch", kg: 3.7, val: 18, gold: true });
  assert.equal(b.isNew, false); assert.equal(b.pbKg, true); assert.equal(b.pbVal, true);
  const c = E.land(s, { id: "perch", kg: 2, val: 9, gold: false });
  assert.equal(c.pbKg, false);
  assert.deepEqual({ ...s.journal.perch, first: 0 }, { n: 3, kg: 3.7, val: 18, gold: 1, first: 0 });
  assert.equal(s.stats.bestKg, 3.7);
  E.land(s, { id: "old_boot", kg: 9, val: 1, gold: false });
  assert.equal(s.stats.bestKg, 3.7, "a boot is not a fish");
});

/* ---------------- passive and offline income ---------------- */

test("passive income adds up fractions of a dollar and boats get their bonuses", () => {
  const s = fresh();
  assert.equal(E.perMin(s), 0);
  s.own.sam = 1;                        // $12/min = $0.20/s
  let got = 0;
  for (let i = 0; i < 600; i++) got += E.tick(s, 0.1);
  assert.equal(got, 12);
  s.own.smallboat = 1;
  const plain = E.perMin(s);
  s.own.dock = 1;
  assert.ok(E.perMin(s) > plain, "the dock makes boats earn more");
});

test("offline earnings: paid for time away, capped, and never for a clock that went backwards", () => {
  const s = fresh();
  s.own.sam = 1;
  assert.equal(E.offline(s, 1000), null, "the first visit only sets the mark");
  const r = E.offline(s, 1000 + 30 * 60 * 1000);
  assert.equal(r.earned, 360);
  const back = E.offline(s, 1000);
  assert.equal(back, null);
  assert.equal(s.lastSeen, 1000);
  const huge = E.offline(s, 1000 + 400 * 24 * 3600 * 1000);
  assert.equal(huge.capped, true);
  assert.equal(huge.earned, 12 * 60 * G.OFFLINE_BASE_HOURS);
  s.own.nana = 2; s.own.storage = 1;
  assert.equal(E.offlineCapHours(s), G.OFFLINE_BASE_HOURS + 4 + 4);
  const junk = E.offline(s, NaN);
  assert.equal(junk, null);
});

/* ---------------- goals ---------------- */

test("goals can be claimed once, and a bait reward you already own becomes cash", () => {
  const s = fresh();
  assert.equal(E.claim(s, "first_fish").ok, false);
  E.land(s, { id: "perch", kg: 1, val: 7, gold: false });
  const cash = E.cash(s);
  assert.equal(E.claim(s, "first_fish").ok, true);
  assert.equal(E.cash(s), cash + G.GOAL.first_fish.reward.cash);
  assert.equal(E.claim(s, "first_fish").ok, false);

  const t = fresh();
  E.land(t, { id: "trout", kg: 1, val: 20, gold: false });
  const r = E.claim(t, "trout");
  assert.equal(r.bait, "minnows"); assert.equal(t.own.minnows, 1);
  const u = fresh();
  u.own.minnows = 1;
  E.land(u, { id: "trout", kg: 1, val: 20, gold: false });
  assert.equal(E.claim(u, "trout").cash, G.GOAL.trout.reward.cash);
});

test("there is always a next target until everything is bought", () => {
  const s = fresh();
  const t = E.nextTarget(s);
  assert.ok(t && t.gap >= 0 && t.name);
  const m = maxed();
  assert.equal(E.nextTarget(m), null);
});

test("competition medals scale with the water", () => {
  const pond = E.compTargets("pond"), deep = E.compTargets("deep");
  assert.equal(pond.length, 3);
  assert.ok(pond[0].kg > pond[1].kg && pond[1].kg > pond[2].kg);
  assert.ok(deep[0].prize > pond[0].prize * 50);
  assert.equal(E.compResult("pond", 0), null);
  assert.equal(E.compResult("pond", 999).id, "gold");
});

test("formatting reads like money and weight", () => {
  assert.equal(G.fmtMoney(1234), "$1,234");
  assert.equal(G.fmtMoney(26860000), "$26.86M");
  assert.equal(G.fmtKg(0.045), "45 g");
  assert.equal(G.fmtKg(3.7), "3.70 kg");
  assert.equal(G.fmtKg(240.4), "240 kg");
});
