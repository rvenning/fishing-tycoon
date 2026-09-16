// Balance: the reeling mini-game is fair to a child, and a steady player
// progresses through the whole business without ever stalling.
//
// The progression bot (tests/bots.js) buys the cheapest thing it can afford the
// moment it can, which is a pessimistic shopper — so these times are an upper
// bound for someone playing sensibly.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, mulberry } = require("./load.js");
const { makeBot } = require("./bots.js");

const G = loadEngine();
const E = G.Econ;

const landRate = (s, fight, brain, assist, n = 300, seed = 1) => {
  const rand = mulberry(seed);
  let ok = 0, time = 0;
  for (let i = 0; i < n; i++) {
    const r = G.playReel(E.reelParams(s, { fight }, null, assist), rand, G.reelBrain({ ...brain, rand }));
    if (r.done === "landed") { ok++; time += r.t; }
  }
  return { rate: ok / n, avg: time / Math.max(1, ok) };
};

const KID = { react: 0.28, slop: 0.4 };
const SLOPPY = { react: 0.45, slop: 0.7 };

test("reeling a common pond fish is kind to a child and takes a few seconds", () => {
  const s = E.blank();
  const f = E.fightFor(G.CATCH.perch, 1, E.mods(s));
  const kid = landRate(s, f, KID, false);
  assert.ok(kid.rate >= 0.97, `kid lands ${kid.rate}`);
  assert.ok(kid.avg >= 1 && kid.avg <= 4, `takes ${kid.avg}s`);
  assert.ok(landRate(s, f, SLOPPY, false).rate >= 0.85, "even a distracted player mostly lands them");
});

test("doing nothing, or holding forever, loses the fish", () => {
  const s = E.blank();
  const rand = mulberry(3);
  const p = E.reelParams(s, { fight: 0.2 }, null, false);
  assert.notEqual(G.playReel(p, rand, () => false).done, "landed");
  assert.equal(G.playReel(p, rand, () => true).done, "snapped");
});

test("the reel upgrade and easy reeling make hard fish fairer", () => {
  const s = E.blank();
  const hard = 0.9;
  const base = landRate(s, hard, KID, false).rate;
  s.own.reel = 4;
  const better = landRate(s, hard, KID, false).rate;
  s.own.reel = 1;
  const easy = landRate(s, hard, KID, true).rate;
  assert.ok(better > base + 0.1, `reel: ${base} -> ${better}`);
  assert.ok(easy > base + 0.1, `easy: ${base} -> ${easy}`);
  assert.ok(base < 0.9, "a hard fish on basic gear is genuinely hard");
});

test("a steady player reaches every location, and the whole business, in a sensible time", () => {
  const hm = (t) => `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, "0")}m`;
  const fails = [];
  const limits = { river: 8 * 60, lake: 35 * 60, pier: 90 * 60, open: 4 * 3600, deep: 7 * 3600 };
  for (const seed of [1, 2]) {
    const bot = makeBot(G, mulberry(seed));
    let lastBuys = 0, lastCheck = 0;
    while (bot.fishingTime < 20 * 3600 && !bot.s.own.hq) {
      bot.play(300);
      // Never stuck: something gets bought at least every 45 minutes of play —
      // relaxed to 90 once the last big-ticket items (the flagship, the HQ) are
      // what's left, because those are meant to be long-term goals.
      const window = bot.time < 6 * 3600 ? 45 * 60 : 90 * 60;
      if (bot.time - lastCheck >= window) {
        if (bot.log.length === lastBuys) fails.push(`seed ${seed}: nothing bought between ${hm(lastCheck)} and ${hm(bot.time)}`);
        lastBuys = bot.log.length; lastCheck = bot.time;
      }
    }
    for (const [loc, max] of Object.entries(limits)) {
      const at = bot.at["loc:" + loc];
      if (at === undefined || at > max) fails.push(`seed ${seed}: ${loc} at ${at === undefined ? "never" : hm(at)} (limit ${hm(max)})`);
    }
    if (!bot.s.own.hq) fails.push(`seed ${seed}: no Harbour HQ after 20h`);
    else if (bot.time < 6 * 3600) fails.push(`seed ${seed}: the whole game done in ${hm(bot.time)} — too short`);
    // Manual fishing stays worth doing all the way through.
    if (bot.s.stats.earnedFish < bot.s.stats.earnedIdle) fails.push(`seed ${seed}: idle income out-earned fishing`);
  }
  assert.deepEqual(fails, []);
});

test("the first minute pays for a first upgrade", () => {
  const bot = makeBot(G, mulberry(4));
  bot.play(75);
  assert.ok(bot.log.length >= 1, "nothing affordable in the first 75 seconds");
  assert.ok(bot.s.stats.caught >= 5);
});
