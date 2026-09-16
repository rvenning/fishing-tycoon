// The reeling mini-game, as a pure simulation.
//
// A horizontal tension meter runs from slack (0) to snapping (1). A green safe
// zone sits somewhere along it and wanders as the fish swims about. Holding
// down reels in and pushes the marker up; letting go lets line out and it
// drifts down. The fish tugs on top of that. Time spent in the zone lands the
// fish; time spent outside it fills a strain gauge, and a full gauge loses it.
//
// Nothing here draws or listens. js/main.js feeds it `holding` every frame;
// tests and the balance bot feed it the same thing from a brain.

const Reel = {
  make(params, rand) {
    return {
      ...params,
      rand,
      t: 0,
      p: 0.32,               // marker position
      v: 0,
      c: 0.5,                // zone centre
      prog: 0,               // 0..1 landed
      strain: 0,             // 0..1 lost
      side: 0,               // -1 too slack, +1 too tight, 0 in zone
      jolt: 0,               // current tug, decays
      nextJolt: 0.6 + rand() * 0.8,
      ph: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
      done: null,            // "landed" | "snapped" | "slipped"
    };
  },

  zoneLo(st) { return st.c - st.zone / 2; },
  zoneHi(st) { return st.c + st.zone / 2; },

  step(st, dt, holding) {
    if (st.done || !(dt > 0)) return st.done;
    dt = Math.min(dt, 0.05);
    st.t += dt;

    // The zone wanders on two slow sine waves, kept on the meter.
    const half = st.zone / 2;
    const w = st.wander * (0.65 * Math.sin(st.t * st.wanderSpeed + st.ph[0]) + 0.35 * Math.sin(st.t * st.wanderSpeed * 2.3 + st.ph[1]));
    st.c = Math.max(0.06 + half, Math.min(0.94 - half, 0.52 + w));

    // Hold to reel in, let go to give line. The marker eases toward a target
    // speed rather than snapping to it, so it feels like a spool, not a switch.
    const target = holding ? 0.62 : -0.52;
    st.v += (target - st.v) * Math.min(1, 6.5 * dt);

    // The fish: a steady wobble plus the occasional sharp tug either way.
    st.nextJolt -= dt;
    if (st.nextJolt <= 0) {
      st.jolt = (st.rand() < 0.62 ? 1 : -1) * st.pull * (1.6 + st.rand() * 1.4);
      st.nextJolt = 0.7 + st.rand() * 1.3;
    }
    st.jolt *= Math.exp(-3.2 * dt);
    const wobble = st.pull * 0.55 * Math.sin(st.t * 3.1 + st.ph[2]);

    st.p = Math.max(0, Math.min(1, st.p + (st.v + wobble + st.jolt) * dt));

    const inZone = st.p >= st.c - half && st.p <= st.c + half;
    if (inZone) {
      st.side = 0;
      st.prog = Math.min(1, st.prog + dt / st.landTime);
      st.strain = Math.max(0, st.strain - (dt / st.strainTime) * 1.25);
    } else {
      st.side = st.p > st.c ? 1 : -1;
      // Pinned against either end of the meter strains faster — that is
      // genuinely doing nothing, not a near miss.
      const pinned = st.p <= 0 || st.p >= 1 ? 1.6 : 1;
      st.strain = Math.min(1, st.strain + (dt / st.strainTime) * pinned);
    }

    if (st.prog >= 1) st.done = "landed";
    else if (st.strain >= 1) st.done = st.side > 0 ? "snapped" : "slipped";
    return st.done;
  },
};

// A reeling brain, used by the tests and the balance bot. It looks at the
// meter only every `react` seconds (a person does not re-decide sixty times a
// second) and aims a little inside the zone, with some wobble in its judgement.
function reelBrain({ react = 0.18, slop = 0.25, rand }) {
  let next = 0, hold = false;
  return (st, dt) => {
    next -= dt;
    if (next <= 0) {
      next = react * (0.7 + rand() * 0.6);
      const err = (rand() - 0.5) * st.zone * slop * 2;
      // Lead the zone a little in the direction the marker is travelling.
      const guess = st.p + st.v * react * 0.5;
      hold = guess + err < st.c;
    }
    return hold;
  };
}

// Play one reel to the end with a brain. Returns the outcome and how long it took.
function playReel(params, rand, brain, dt = 1 / 60) {
  const st = Reel.make(params, rand);
  let guard = 0;
  while (!st.done && guard++ < 60 * 60) Reel.step(st, dt, brain(st, dt));
  return { done: st.done || "slipped", t: st.t };
}
