// Save, load and family sync. The merge is the one function that can destroy a
// save, so it is tested in both argument orders and against the obvious ways a
// save goes bad.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, loadStorage } = require("./load.js");

const G = loadEngine();
const E = G.Econ;
const plain = (x) => JSON.parse(JSON.stringify(x));

test("normalize survives garbage without throwing", () => {
  const junk = [null, undefined, 42, "save", [], { cashEarned: "lots" }, { own: { rod: 99, fake: 3 } },
    { journal: { perch: "yes", nope: { n: 1 } }, haul: [null, { id: "ghost" }, { id: "perch", kg: -3, val: NaN }] },
    { cashEarned: 100, cashSpent: 5000 }, { loc: "moon", bait: "premium" }, { stats: { caught: -5, casts: Infinity } }];
  for (const j of junk) {
    const s = E.normalize(j);
    assert.ok(E.cash(s) >= 0);
    assert.ok(G.LOCATION[s.loc]);
    assert.equal(s.own.rod >= 1 && s.own.rod <= G.TRACK.rod.levels.length, true);
    assert.ok(Array.isArray(s.haul));
    for (const h of s.haul) assert.ok(G.CATCH[h.id] && h.kg >= 0 && Number.isFinite(h.val));
    for (const k of G.STAT_KEYS) assert.ok(Number.isFinite(s.stats[k]) && s.stats[k] >= 0, k);
  }
  const n = E.normalize({ own: { rod: 99 }, loc: "moon", bait: "premium", journal: { nope: { n: 1 } } });
  assert.equal(n.own.rod, G.TRACK.rod.levels.length);
  assert.equal(n.loc, "pond");
  assert.equal(n.bait, "worms", "you cannot fish with bait you don't own");
  assert.deepEqual(Object.keys(n.journal), []);
});

test("a normalized save round-trips through JSON unchanged", () => {
  const s = E.blank();
  E.earn(s, 5000);
  E.buy(s, "rod");
  E.land(s, { id: "carp", kg: 4, val: 12, gold: true });
  s.goals.first_fish = 1;
  const back = E.normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(plain(back), plain(E.normalize(s)));
});

test("merge never resurrects spent money and keeps every discovery", () => {
  const base = E.blank();
  E.earn(base, 1000);
  const a = E.normalize(plain(base)), b = E.normalize(plain(base));
  E.buy(a, "rod");                        // phone spends
  E.land(b, { id: "trout", kg: 2, val: 20, gold: false });   // iPad fishes
  a.updated = 10; b.updated = 5;
  for (const [x, y] of [[a, b], [b, a]]) {
    const m = E.merge(plain(x), plain(y));
    assert.equal(m.cashSpent, a.cashSpent);
    assert.equal(E.cash(m), E.cash(a));
    assert.equal(m.own.rod, 2);
    assert.ok(m.journal.trout);
  }
});

test("merge is symmetric for everything that only grows", () => {
  const a = E.blank(), b = E.blank();
  E.land(a, { id: "perch", kg: 3, val: 9, gold: false });
  E.land(b, { id: "perch", kg: 1, val: 14, gold: true });
  E.land(b, { id: "carp", kg: 7, val: 20, gold: false });
  a.locs.river = 1; b.own.sam = 2; a.stats.casts = 50; b.stats.casts = 20; a.goals.first_fish = 1;
  a.lastSeen = 900; b.lastSeen = 1200; a.tut = 5; b.tut = 2;
  const ab = E.merge(plain(a), plain(b)), ba = E.merge(plain(b), plain(a));
  for (const m of [ab, ba]) {
    assert.deepEqual({ ...m.journal.perch, first: 0 }, { n: 1, kg: 3, val: 14, gold: 1, first: 0 });
    assert.ok(m.journal.carp && m.locs.river && m.goals.first_fish);
    assert.equal(m.own.sam, 2); assert.equal(m.stats.casts, 50); assert.equal(m.lastSeen, 1200); assert.equal(m.tut, 5);
  }
  assert.deepEqual(plain(ab.stats), plain(ba.stats));
  assert.deepEqual(plain(ab.own), plain(ba.own));
});

test("merge takes the haul from the device that has sold more", () => {
  const a = E.blank(), b = E.blank();
  E.land(a, { id: "perch", kg: 1, val: 7, gold: false });
  E.land(b, { id: "perch", kg: 1, val: 7, gold: false });
  E.sell(a);                                    // phone sold it
  E.land(a, { id: "carp", kg: 2, val: 9, gold: false });
  for (const m of [E.merge(plain(a), plain(b)), E.merge(plain(b), plain(a))]) {
    assert.deepEqual(m.haul.map((h) => h.id), ["carp"], "the sold perch must not come back");
  }
});

test("the storage layer saves and loads a game through gamekit", () => {
  const S = loadStorage();
  const p = S.Storage.addProfile("Tester", "🎣", "");
  const s = S.Econ.blank();
  S.Econ.earn(s, 777);
  S.Econ.land(s, { id: "bass", kg: 2, val: 30, gold: false });
  s.updated = 1;
  S.Storage.saveProgress(p.id, s);
  const back = S.Storage.load(p.id);
  assert.equal(S.Econ.cash(back), 802);
  assert.ok(back.journal.bass);
  assert.equal(back.haul.length, 1);
  // a profile with nothing saved loads as a brand-new game
  assert.equal(S.Econ.cash(S.Storage.load("nobody")), G.START_CASH);
});
