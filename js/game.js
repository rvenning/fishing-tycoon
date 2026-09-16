// Econ: the whole game's rules as plain functions over a saved-state object.
//
// No DOM, no canvas, no timers, and no hidden randomness — anything random
// takes a `rand` function, so the tests and the balance bot can seed it. The
// state object IS the saved progress, so every rule here is also a statement
// about what gets written to disk.
//
// Money is two monotonic counters, cashEarned and cashSpent, and the balance
// is derived. Family sync merges progress field by field with max(), and a
// stored balance would resurrect spent money on every sync.

const START_CASH = 25;
const OFFLINE_BASE_HOURS = 2;
const OFFLINE_MAX_HOURS = 24;
const GOLD_BASE = 0.006;           // chance any fish is golden, outside events
const GOLD_MULT = 5;
const BITE_WINDOW = 1.6;           // seconds to tap once the bobber goes under
const MAX_NIBBLES = 3;             // bites before an ignored fish swims off
const EVENT_COOLDOWN = 170;        // seconds of fishing between events
const EVENT_CHANCE = 0.2;          // per catch, once the cooldown is over

const STAT_KEYS = [
  "casts", "caught", "escaped", "sales", "sold", "earnedFish", "earnedIdle", "earnedGoals",
  "earnedEvents", "bestKg", "bestVal", "bestSale", "rares", "odds", "goldens", "secs",
  "events", "comps", "compWins", "bought", "released",
];

/* ---------- formatting (shared by the UI, kept here so tests can read it) ---------- */

function fmtMoney(n) {
  n = Math.floor(Number(n) || 0);
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e7) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  return `${sign}$${a.toLocaleString("en-US")}`;
}

function fmtKg(kg) {
  kg = Number(kg) || 0;
  if (kg < 0.1) return `${Math.round(kg * 1000)} g`;
  if (kg < 10) return `${kg.toFixed(2)} kg`;
  if (kg < 100) return `${kg.toFixed(1)} kg`;
  return `${Math.round(kg).toLocaleString("en-US")} kg`;
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

const Econ = {
  /* ---------- state ---------- */

  blank() {
    const own = {};
    for (const t of TRACKS) own[t.id] = t.start || 0;
    return {
      v: 1,
      cashEarned: START_CASH, cashSpent: 0,
      own,
      bait: "worms",
      loc: "pond",
      locs: { pond: 1 },
      journal: {},           // { id: { n, kg, val, gold, first } }
      haul: [],              // [{ id, kg, val, gold }]
      goals: {},             // { id: 1 } once claimed
      stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
      bestKgId: "", bestValId: "",
      tut: 0,                // tutorial step reached (monotonic)
      lastSeen: 0,           // ms timestamp of the last moment the game was open
      updated: 0,
    };
  },

  // Make any object safe to play on: missing fields filled, nonsense clamped,
  // unknown ids dropped. A corrupt or half-written save must never crash the
  // game — the worst it may do is lose the broken part.
  normalize(p) {
    const b = this.blank();
    if (!p || typeof p !== "object") return b;
    const num = (v, d = 0) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d);
    const s = { ...b, ...p };

    s.cashEarned = num(p.cashEarned, START_CASH);
    s.cashSpent = Math.min(num(p.cashSpent), s.cashEarned);

    s.own = { ...b.own };
    for (const t of TRACKS) {
      const n = Math.floor(num(p.own && p.own[t.id], t.start || 0));
      s.own[t.id] = Math.max(t.start || 0, Math.min(t.levels.length, n));
    }

    s.locs = { pond: 1 };
    for (const l of LOCATIONS) if (p.locs && p.locs[l.id]) s.locs[l.id] = 1;
    s.loc = LOCATION[p.loc] && s.locs[p.loc] ? p.loc : "pond";
    s.bait = TRACK[p.bait] && TRACK[p.bait].bait && s.own[p.bait] > 0 ? p.bait : "worms";

    s.journal = {};
    for (const [id, e] of Object.entries(p.journal || {})) {
      if (!CATCH[id] || !e || typeof e !== "object") continue;
      s.journal[id] = { n: Math.floor(num(e.n, 1)) || 1, kg: num(e.kg), val: num(e.val), gold: Math.floor(num(e.gold)), first: num(e.first) };
    }

    s.haul = (Array.isArray(p.haul) ? p.haul : [])
      .filter((h) => h && CATCH[h.id])
      .map((h) => ({ id: h.id, kg: num(h.kg), val: Math.floor(num(h.val)), gold: !!h.gold }))
      .slice(0, 200);

    s.goals = {};
    for (const id of Object.keys(p.goals || {})) if (GOAL[id]) s.goals[id] = 1;

    s.stats = {};
    for (const k of STAT_KEYS) s.stats[k] = num(p.stats && p.stats[k]);
    s.bestKgId = CATCH[p.bestKgId] ? p.bestKgId : "";
    s.bestValId = CATCH[p.bestValId] ? p.bestValId : "";
    s.tut = Math.floor(num(p.tut));
    s.lastSeen = num(p.lastSeen);
    s.updated = num(p.updated);
    return s;
  },

  // Reconcile two devices' saves. Everything that only ever grows takes the
  // larger; the handful of CHOICES (where you are standing, which bait is on
  // the hook) come from whichever save was written most recently. The haul is
  // the one list that shrinks — it follows the save that has sold more often,
  // then the one that has caught more.
  merge(a, b) {
    a = this.normalize(a); b = this.normalize(b);
    const newer = (b.updated || 0) >= (a.updated || 0) ? b : a;
    const out = { ...a, ...b };

    out.cashEarned = Math.max(a.cashEarned, b.cashEarned);
    out.cashSpent = Math.max(a.cashSpent, b.cashSpent);
    out.own = {};
    for (const t of TRACKS) out.own[t.id] = Math.max(a.own[t.id] || 0, b.own[t.id] || 0);
    out.locs = { ...a.locs, ...b.locs };
    out.goals = { ...a.goals, ...b.goals };
    out.stats = {};
    for (const k of STAT_KEYS) out.stats[k] = Math.max(a.stats[k] || 0, b.stats[k] || 0);
    out.bestKgId = a.stats.bestKg > b.stats.bestKg ? a.bestKgId : b.bestKgId;
    out.bestValId = a.stats.bestVal > b.stats.bestVal ? a.bestValId : b.bestValId;

    out.journal = {};
    for (const id of new Set([...Object.keys(a.journal), ...Object.keys(b.journal)])) {
      const x = a.journal[id], y = b.journal[id];
      if (!x || !y) { out.journal[id] = { ...(x || y) }; continue; }
      const firsts = [x.first, y.first].filter((f) => f > 0);
      out.journal[id] = {
        n: Math.max(x.n, y.n), kg: Math.max(x.kg, y.kg), val: Math.max(x.val, y.val),
        gold: Math.max(x.gold, y.gold), first: firsts.length ? Math.min(...firsts) : 0,
      };
    }

    const haulSide = a.stats.sales !== b.stats.sales
      ? (a.stats.sales > b.stats.sales ? a : b)
      : (a.stats.caught > b.stats.caught ? a : b);
    out.haul = haulSide.haul.map((h) => ({ ...h }));

    out.tut = Math.max(a.tut, b.tut);
    out.lastSeen = Math.max(a.lastSeen, b.lastSeen);
    out.loc = newer.loc;
    out.bait = newer.bait;
    out.updated = Math.max(a.updated, b.updated);
    return this.normalize(out);
  },

  cash(s) { return Math.max(0, Math.floor(s.cashEarned - s.cashSpent)); },

  earn(s, amount, stat) {
    amount = Math.max(0, Math.floor(amount || 0));
    s.cashEarned += amount;
    if (stat) s.stats[stat] = (s.stats[stat] || 0) + amount;
    return amount;
  },

  /* ---------- what you own ---------- */

  own(s, id) { return s.own[id] || 0; },

  // The fx of the level currently owned, or {} if none.
  fx(s, id) {
    const n = this.own(s, id);
    return n > 0 ? TRACK[id].levels[n - 1].fx : {};
  },

  // Sum one fx key across every track (e.g. all `sell` bonuses).
  sumFx(s, key, filter) {
    let total = 0;
    for (const t of TRACKS) {
      if (filter && !filter(t)) continue;
      const v = this.fx(s, t.id)[key];
      if (typeof v === "number") total += v;
    }
    return total;
  },

  // Every modifier the rules care about, in one place, for this state + event.
  mods(s, ev) {
    const em = (ev && ev.mods) || {};
    const rod = this.fx(s, "rod"), reel = this.fx(s, "reel"), line = this.fx(s, "line");
    const bait = this.fx(s, s.bait);
    const baitPower = 1 + this.sumFx(s, "bait");
    const boost = {};
    for (const r of RARITY_ORDER) {
      const raw = (bait.boost && bait.boost[r]) || 1;
      boost[r] = 1 + (raw - 1) * baitPower;
    }
    return {
      luck: (rod.luck || 1) * (1 + this.sumFx(s, "luckPct")) * (em.luck || 1),
      rareEvent: em.rare || 1,
      boost,
      odd: (bait.odd ? 1 + (bait.odd - 1) * baitPower : 1) * (em.odd || 1),
      ripple: !!em.ripple,
      legend: !!em.legend,
      size: (rod.size || 1) * (bait.size || 1),
      gold: GOLD_BASE + (em.gold || 0),
      sell: (1 + this.sumFx(s, "sell")) * (em.sell || 1),
      lineKg: line.kg || 4,
      reel: { zone: reel.zone || 0, speed: reel.speed || 1, ease: reel.ease || 0 },
      fight: em.fight || 0,
      wait: Math.max(0.35, 1 - this.sumFx(s, "wait")) * (em.wait || 1),
      capacity: (this.fx(s, "tackle").cap || 6) + this.sumFx(s, "haul"),
      autoSell: this.sumFx(s, "auto") > 0,
    };
  },

  /* ---------- catching ---------- */

  // The weighted catch table for a location, as the dice will see it.
  table(s, locId, ev) {
    const m = this.mods(s, ev);
    return CATCHES.filter((c) => c.loc === locId).map((c) => {
      const r = RARITY[c.rarity];
      let w = r.weight * (c.w || 1);
      w *= Math.pow(m.luck, r.luck);
      if (r.rank >= 2) w *= m.rareEvent;
      w *= m.boost[c.rarity] || 1;
      if (c.odd) w *= m.odd;
      if (c.ripple && !m.ripple) w *= 0.25;
      if (m.legend) w = c.rarity === "legendary" ? 1 : 0;
      return { c, w };
    });
  },

  // Chance of each catch, 0..1, for the journal's "how rare is this here" hints and tests.
  odds(s, locId, ev) {
    const t = this.table(s, locId, ev);
    const total = t.reduce((a, e) => a + e.w, 0) || 1;
    return Object.fromEntries(t.map((e) => [e.c.id, e.w / total]));
  },

  pick(table, rand) {
    const total = table.reduce((a, e) => a + e.w, 0);
    let r = rand() * total;
    for (const e of table) { r -= e.w; if (r < 0) return e.c; }
    return table[table.length - 1].c;
  },

  // Where in a species' size range a catch lands: 0..1, skewed small, pulled
  // up by a better rod and bait, with an occasional trophy.
  sizeFrac(m, rand) {
    if (rand() < 0.04) return 0.82 + rand() * 0.18;
    return Math.pow(rand(), 1.8 / Math.pow(m.size, 1.3));
  },

  priceFor(c, kg, gold) {
    const mid = catchMid(c);
    const v = c.value * (0.45 + 0.55 * (kg / mid));
    return Math.max(1, Math.round(v * (gold ? GOLD_MULT : 1)));
  },

  // Roll one catch. Returns everything the rest of the game needs to know.
  rollCatch(s, rand, ev, locId = s.loc) {
    const m = this.mods(s, ev);
    const c = this.pick(this.table(s, locId, ev), rand);
    const t = this.sizeFrac(m, rand);
    let kg = c.kg[0] + (c.kg[1] - c.kg[0]) * t;
    kg = kg < 1 ? Math.round(kg * 1000) / 1000 : Math.round(kg * 100) / 100;
    const gold = !c.odd && rand() < m.gold;
    const val = this.priceFor(c, kg, gold);
    return { id: c.id, kg, val, gold, fight: this.fightFor(c, kg, m) };
  },

  // How hard the fish fights, roughly 0..1.3. Heavier than your line is the
  // big one: that is what makes a stronger line feel like an upgrade.
  fightFor(c, kg, m) {
    if (c.odd) return 0.08;
    const strain = Math.max(0, Math.min(0.5, (kg / m.lineKg - 0.6) * 0.32));
    return Math.max(0.05, RARITY[c.rarity].fight + strain + m.fight - m.reel.ease);
  },

  // The reeling mini-game's tuning for one fish. js/reel.js runs it.
  reelParams(s, fish, ev, assist) {
    const m = this.mods(s, ev);
    const d = fish.fight;
    return {
      zone: Math.max(0.13, Math.min(0.56, 0.3 - 0.12 * d + m.reel.zone + (assist ? 0.09 : 0))),
      landTime: Math.max(1.0, Math.min(5, (1.4 + 2.3 * d) / m.reel.speed)),
      strainTime: Math.max(0.8, (1.9 - 0.55 * d) * (assist ? 1.6 : 1)),
      pull: 0.05 + 0.2 * d,
      wander: 0.05 + 0.17 * d,
      wanderSpeed: 0.5 + 0.9 * d,
    };
  },

  waitTime(s, rand, ev) {
    const m = this.mods(s, ev);
    const base = 1.2 + rand() * 1.9 + LOCATION[s.loc].pace;
    return Math.max(0.7, base * m.wait);
  },

  capacity(s, ev) { return this.mods(s, ev).capacity; },
  isFull(s) { return s.haul.length >= this.capacity(s); },

  // A fish is on the bank. Journal, personal bests and stats all update here,
  // and the catch goes into the haul (or straight back into the sea).
  land(s, fish, now = 0) {
    const c = CATCH[fish.id];
    const r = RARITY[c.rarity];
    const st = s.stats;
    st.caught++;
    if (r.rank >= 2 && !c.odd) st.rares++;
    if (c.odd) st.odds++;
    if (fish.gold) st.goldens++;

    const prev = s.journal[c.id];
    const out = { isNew: !prev, pbKg: false, pbVal: false, stored: false, released: 0, recordKg: false };
    if (!prev) s.journal[c.id] = { n: 0, kg: 0, val: 0, gold: 0, first: now };
    const j = s.journal[c.id];
    j.n++;
    if (fish.gold) j.gold++;
    if (prev && fish.kg > prev.kg) out.pbKg = true;
    if (prev && fish.val > prev.val) out.pbVal = true;
    j.kg = Math.max(j.kg, fish.kg);
    j.val = Math.max(j.val, fish.val);

    if (!c.odd && fish.kg > st.bestKg) { st.bestKg = fish.kg; s.bestKgId = c.id; out.recordKg = true; }
    if (fish.val > st.bestVal) { st.bestVal = fish.val; s.bestValId = c.id; }

    if (c.release) {
      // Released, never sold — the reward is paid on the spot.
      out.released = this.earn(s, fish.val * this.mods(s).sell, "earnedFish");
      st.released++;
    } else if (s.haul.length < this.capacity(s)) {
      s.haul.push({ id: c.id, kg: fish.kg, val: fish.val, gold: !!fish.gold });
      out.stored = true;
    }
    return out;
  },

  /* ---------- selling ---------- */

  // The haul grouped for the receipt: one line per species (golden separately).
  haulLines(s, ev) {
    const sell = this.mods(s, ev).sell;
    const lines = new Map();
    for (const h of s.haul) {
      const key = h.id + (h.gold ? "*" : "");
      const line = lines.get(key) || { id: h.id, gold: h.gold, n: 0, total: 0, bestKg: 0 };
      line.n++;
      line.total += Math.round(h.val * sell);
      line.bestKg = Math.max(line.bestKg, h.kg);
      lines.set(key, line);
    }
    return [...lines.values()].sort((a, b) => b.total - a.total);
  },

  haulValue(s, ev) { return this.haulLines(s, ev).reduce((a, l) => a + l.total, 0); },

  sell(s, ev) {
    const lines = this.haulLines(s, ev);
    const total = lines.reduce((a, l) => a + l.total, 0);
    if (!s.haul.length) return { total: 0, lines, count: 0 };
    const count = s.haul.length;
    this.earn(s, total, "earnedFish");
    s.stats.sales++;
    s.stats.sold += count;
    s.stats.bestSale = Math.max(s.stats.bestSale, total);
    s.haul = [];
    return { total, lines, count };
  },

  /* ---------- buying ---------- */

  needsText(key, n) {
    if (LOCATION[key]) return `Unlock ${LOCATION[key].name}`;
    const t = TRACK[key];
    if (!t) return key;
    if (t.cat === "rod" || t.cat === "reel" || t.cat === "line" || t.cat === "tackle") return levelName(t, n);
    return n > 1 ? `${t.name} level ${n}` : (t.helper ? `Hire ${t.name}` : t.name);
  },

  unmet(s, needs) {
    const out = [];
    for (const [k, n] of Object.entries(needs || {})) {
      const have = LOCATION[k] ? (s.locs[k] ? 1 : 0) : this.own(s, k);
      if (have < n) out.push(this.needsText(k, n));
    }
    return out;
  },

  nextLevel(s, id) {
    const t = TRACK[id];
    return t ? t.levels[this.own(s, id)] || null : null;
  },

  // Can this track's next level be bought right now? Always says why not.
  check(s, id) {
    const t = TRACK[id];
    if (!t) return { ok: false, reason: "unknown" };
    const lv = this.nextLevel(s, id);
    if (!lv) return { ok: false, reason: "max" };
    const unmet = this.unmet(s, lv.needs);
    if (unmet.length) return { ok: false, reason: "locked", unmet, cost: lv.cost };
    if (this.cash(s) < lv.cost) return { ok: false, reason: "cash", cost: lv.cost, short: lv.cost - this.cash(s) };
    return { ok: true, cost: lv.cost };
  },

  buy(s, id) {
    const chk = this.check(s, id);
    if (!chk.ok) return chk;
    s.cashSpent += chk.cost;
    s.own[id] = this.own(s, id) + 1;
    s.stats.bought++;
    // New bait goes straight on the hook — you just bought it to use it.
    if (TRACK[id].bait) s.bait = id;
    return { ok: true, cost: chk.cost, level: s.own[id] };
  },

  selectBait(s, id) {
    if (!TRACK[id] || !TRACK[id].bait || !this.own(s, id)) return false;
    s.bait = id;
    return true;
  },

  /* ---------- locations ---------- */

  checkLoc(s, id) {
    const l = LOCATION[id];
    if (!l) return { ok: false, reason: "unknown" };
    if (s.locs[id]) return { ok: false, reason: "owned" };
    const unmet = this.unmet(s, l.needs);
    if (unmet.length) return { ok: false, reason: "locked", unmet, cost: l.cost };
    if (this.cash(s) < l.cost) return { ok: false, reason: "cash", cost: l.cost, short: l.cost - this.cash(s) };
    return { ok: true, cost: l.cost };
  },

  unlock(s, id) {
    const chk = this.checkLoc(s, id);
    if (!chk.ok) return chk;
    s.cashSpent += chk.cost;
    s.locs[id] = 1;
    s.loc = id;
    return { ok: true, cost: chk.cost };
  },

  travel(s, id) {
    if (!s.locs[id]) return false;
    s.loc = id;
    return true;
  },

  /* ---------- passive income ---------- */

  income(s) {
    const helpers = this.sumFx(s, "perMin", (t) => t.helper);
    const boatsRaw = this.sumFx(s, "perMin", (t) => !t.helper);
    const boatMult = 1 + this.sumFx(s, "boats");
    const all = 1 + this.sumFx(s, "all");
    const species = Object.keys(s.journal).length;
    const aquarium = this.sumFx(s, "perSpecies") * species;
    const perMin = (helpers + boatsRaw * boatMult + aquarium) * all;
    return { perMin, helpers: helpers * all, boats: (boatsRaw * boatMult + aquarium) * all, aquarium: aquarium * all, boatMult, allMult: all };
  },

  perMin(s) { return this.income(s).perMin; },

  // Passive money for `sec` seconds of play. Fractions carry between calls.
  tick(s, sec) {
    if (!(sec > 0)) return 0;
    s._carry = (s._carry || 0) + (this.perMin(s) / 60) * sec;
    const whole = Math.floor(s._carry);
    s._carry -= whole;
    return whole > 0 ? this.earn(s, whole, "earnedIdle") : 0;
  },

  offlineCapHours(s) {
    return Math.min(OFFLINE_MAX_HOURS, OFFLINE_BASE_HOURS + this.sumFx(s, "hours"));
  },

  // Called when a player comes back. Pays for the time away (capped), and
  // moves lastSeen to now. A clock that went BACKWARDS pays nothing and just
  // resets the mark, so winding the date back and forward gains no more than
  // leaving the game closed would have.
  offline(s, now) {
    now = Number(now) || 0;
    if (!s.lastSeen || !(now > 0)) { s.lastSeen = now; return null; }
    const raw = (now - s.lastSeen) / 1000;
    s.lastSeen = now;
    if (!(raw > 0)) return null;
    const capSec = this.offlineCapHours(s) * 3600;
    const sec = Math.min(raw, capSec);
    const earned = Math.floor((this.perMin(s) / 60) * sec);
    if (earned > 0) this.earn(s, earned, "earnedIdle");
    return { sec, raw, earned, capped: raw > capSec, capHours: this.offlineCapHours(s) };
  },

  /* ---------- goals ---------- */

  goal(s, g) {
    const cur = Math.max(0, Number(g.measure(s)) || 0);
    return { g, cur: Math.min(cur, g.need), need: g.need, done: cur >= g.need, claimed: !!s.goals[g.id] };
  },

  claimable(s) { return GOALS.filter((g) => !s.goals[g.id] && this.goal(s, g).done); },

  // The next few goals worth showing: finished-but-unclaimed first, then the
  // earliest unfinished ones.
  upcoming(s, n = 3) {
    const open = GOALS.filter((g) => !s.goals[g.id]).map((g) => this.goal(s, g));
    open.sort((a, b) => (b.done - a.done));
    return open.slice(0, n);
  },

  claim(s, id) {
    const g = GOAL[id];
    if (!g || s.goals[id]) return { ok: false };
    if (!this.goal(s, g).done) return { ok: false };
    s.goals[id] = 1;
    let cash = g.reward.cash || 0, bait = null;
    if (g.reward.bait && !this.own(s, g.reward.bait)) {
      bait = g.reward.bait;
      s.own[bait] = 1;
      s.bait = bait;
      cash = 0;
    }
    if (cash) this.earn(s, cash, "earnedGoals");
    return { ok: true, cash, bait };
  },

  /* ---------- what to aim for ---------- */

  // Everything that could be bought next, with a cost. Used for the "next
  // target" chip and by the balance bot.
  candidates(s) {
    const out = [];
    for (const l of LOCATIONS) {
      if (s.locs[l.id]) continue;
      const unmet = this.unmet(s, l.needs);
      out.push({ kind: "loc", id: l.id, name: l.name, emoji: l.emoji, cost: l.cost, ready: !unmet.length, unmet });
    }
    for (const t of TRACKS) {
      const lv = this.nextLevel(s, t.id);
      if (!lv) continue;
      const unmet = this.unmet(s, lv.needs);
      out.push({ kind: "track", id: t.id, name: levelName(t, this.own(s, t.id) + 1), emoji: t.emoji, cost: lv.cost, ready: !unmet.length, unmet });
    }
    return out;
  },

  // One thing to work toward: the next location if it is open to buy and not
  // wildly dearer than the alternatives, otherwise the cheapest thing you
  // cannot afford yet — "I almost have enough for that".
  nextTarget(s) {
    const cash = this.cash(s);
    const ready = this.candidates(s).filter((c) => c.ready);
    if (!ready.length) return null;
    const cheapest = ready.reduce((a, b) => (b.cost < a.cost ? b : a));
    const loc = ready.filter((c) => c.kind === "loc").sort((a, b) => a.cost - b.cost)[0];
    const unaffordable = ready.filter((c) => c.cost > cash).sort((a, b) => a.cost - b.cost);
    let pick;
    if (loc && loc.cost <= Math.max(cheapest.cost, 1) * 6) pick = loc;
    else pick = unaffordable[0] || cheapest;
    return { ...pick, gap: Math.max(0, pick.cost - cash), frac: Math.min(1, cash / Math.max(1, pick.cost)) };
  },

  /* ---------- events ---------- */

  // Maybe start an event after a catch. `since` = seconds of fishing since the
  // last event ended. Returns an event definition or null.
  rollEvent(s, rand, since) {
    if (since < EVENT_COOLDOWN) return null;
    if (rand() >= EVENT_CHANCE) return null;
    const locIdx = LOCATIONS.findIndex((l) => l.id === s.loc);
    const pool = EVENTS.filter((e) => s.stats.caught >= e.minCatches && locIdx >= (e.minLoc || 0));
    if (!pool.length) return null;
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = rand() * total;
    for (const e of pool) { r -= e.weight; if (r < 0) return e; }
    return pool[pool.length - 1];
  },

  // Competition targets for a location, in kg: the heaviest common or
  // uncommon fish that lives there sets the scale.
  compTargets(locId) {
    const ref = Math.max(...CATCHES.filter((c) => c.loc === locId && !c.odd && RARITY[c.rarity].rank <= 1).map((c) => c.kg[1]));
    const prizeBase = 30 * Math.max(...CATCHES.filter((c) => c.loc === locId && c.rarity === "common").map((c) => c.value));
    return COMP_MEDALS.map((m) => ({ ...m, kg: Math.round(ref * m.frac * 10) / 10, prize: Math.round(prizeBase * m.prize) }));
  },

  compResult(locId, bestKg) {
    return this.compTargets(locId).find((m) => bestKg >= m.kg) || null;
  },
};
