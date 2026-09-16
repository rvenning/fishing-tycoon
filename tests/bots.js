// The progression bot: a player who fishes steadily, sells when the box is
// full, claims goals, always moves to the newest water, and spends money the
// moment something is affordable — cheapest thing first. That is deliberately
// a pessimistic shopper (nobody saves up for the best rod), so "this is how
// long it takes" is an upper bound for a sensible player.
//
// Shared by tests/balance.test.js and tools/progress.js so the suite and the
// diagnostic can never measure two different players.

function makeBot(G, rand, opts = {}) {
  const E = G.Econ;
  const brain = opts.brain || { react: 0.28, slop: 0.4 };   // an attentive eight-year-old
  const s = E.blank();
  const log = [];
  const at = {};                   // milestone -> seconds
  let time = 0, fishingTime = 0;
  let ev = null, evLeft = 0, evCasts = 0, sinceEvent = 0, compBest = 0;
  const earnedBy = { fish: 0, idle: 0 };
  let comps = 0, compWins = 0;

  const mark = (key) => { if (at[key] === undefined) at[key] = time; };

  function advance(sec, fishing) {
    time += sec;
    if (fishing) { fishingTime += sec; s.stats.secs += sec; sinceEvent += sec; }
    earnedBy.idle += E.tick(s, sec);
    if (ev && ev.dur) {
      evLeft -= sec;
      if (evLeft <= 0) endEvent();
    }
  }

  function endEvent() {
    if (ev && ev.id === "comp") {
      comps++;
      const medal = E.compResult(s.loc, compBest);
      if (medal) {
        E.earn(s, medal.prize, "earnedEvents");
        if (medal.id === "gold") { s.stats.compWins++; compWins++; }
      }
    }
    ev = null; sinceEvent = 0; compBest = 0;
  }

  function shop() {
    for (let guard = 0; guard < 50; guard++) {
      const cash = E.cash(s);
      const ready = E.candidates(s).filter((c) => c.ready && c.cost <= cash)
        .filter((c) => !(opts.skip && opts.skip(c)));
      if (!ready.length) return;
      ready.sort((a, b) => a.cost - b.cost);
      const c = ready[0];
      const r = c.kind === "loc" ? E.unlock(s, c.id) : E.buy(s, c.id);
      if (!r.ok) return;
      log.push([time, c.name, c.cost]);
      if (c.kind === "loc") mark("loc:" + c.id);
      else if (E.own(s, c.id) === TRACK_LEN(c.id)) mark("max:" + c.id);
      // Newest water, best bait (magnet only if nothing else).
      const newest = G.LOCATIONS.filter((l) => s.locs[l.id]).pop();
      s.loc = newest.id;
      const baits = G.TRACKS.filter((t) => t.bait && E.own(s, t.id) && t.id !== "magnet");
      s.bait = baits[baits.length - 1].id;
    }
  }
  const TRACK_LEN = (id) => G.TRACK[id].levels.length;

  function claimGoals() {
    for (const g of E.claimable(s)) E.claim(s, g.id);
    // A claimed bait reward auto-equips; keep the best non-magnet one on.
    const baits = G.TRACKS.filter((t) => t.bait && E.own(s, t.id) && t.id !== "magnet");
    s.bait = baits[baits.length - 1].id;
  }

  // One cast, start to finish, in simulated seconds.
  function cast() {
    s.stats.casts++;
    advance(0.9 + E.waitTime(s, rand, ev), true);   // swing + wait
    advance(0.45 + rand() * 0.4, true);              // reaction to the bite
    if (rand() < 0.04) { s.stats.escaped++; return; } // missed the bite entirely
    const fish = E.rollCatch(s, rand, ev);
    const params = E.reelParams(s, fish, ev, !!opts.assist);
    const r = G.playReel(params, rand, G.reelBrain({ ...brain, rand }));
    advance(r.t, true);
    if (ev && ev.casts) { evCasts--; if (evCasts <= 0) endEvent(); }
    if (r.done !== "landed") { s.stats.escaped++; return; }
    const out = E.land(s, fish, time);
    earnedBy.fish += out.released;
    if (ev && ev.id === "comp" && !G.CATCH[fish.id].odd) compBest = Math.max(compBest, fish.kg);
    advance(1.1, true);                               // admire the catch
    if (!ev) {
      const e = E.rollEvent(s, rand, sinceEvent);
      if (e) { ev = e; evLeft = e.dur || 0; evCasts = e.casts || 0; s.stats.events++; }
    }
  }

  function sell() {
    const r = E.sell(s, ev);
    earnedBy.fish += r.total;
    advance(1.5, true);
  }

  function play(seconds) {
    const end = time + seconds;
    while (time < end) {
      if (E.isFull(s) || (s.haul.length && E.cash(s) + E.haulValue(s, ev) >= cheapestReady())) sell();
      claimGoals();
      shop();
      cast();
      mark("species:" + Object.keys(s.journal).length);
    }
  }

  function cheapestReady() {
    const ready = E.candidates(s).filter((c) => c.ready);
    return ready.length ? Math.min(...ready.map((c) => c.cost)) : Infinity;
  }

  // Close the game for `seconds`, then come back.
  function away(seconds) {
    const now = (time + seconds) * 1000;
    if (!s.lastSeen) s.lastSeen = time * 1000;
    const r = E.offline(s, now);
    time += seconds;
    if (r) earnedBy.idle += r.earned;
    claimGoals(); shop();
    s.lastSeen = time * 1000;
  }

  return {
    s, log, at, earnedBy, play, away,
    get time() { return time; }, get fishingTime() { return fishingTime; },
    get comps() { return comps; }, get compWins() { return compWins; },
    startSession() { s.lastSeen = time * 1000; },
  };
}

module.exports = { makeBot };
