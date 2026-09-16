// Fishing: one cast, from swing to catch, as a small state machine.
//
//   idle → cast → wait → bite → reel → show → (idle on the next tap)
//                   ↑______|  (a missed bite nibbles again, a few times)
//   any failure → escape → idle
//
// No DOM and no drawing. It owns timers and the reel simulation, calls Econ
// for anything that is a rule, and reports what happened through `on*`
// callbacks that js/main.js wires to sound, particles and the save.

const CAST_TIME = 0.62;       // swing + line flight
const ESCAPE_TIME = 1.3;      // "it got away" before you can cast again

const Fishing = {
  phase: "idle",
  t: 0,
  waitFor: 0,
  nibbles: 0,
  fish: null,             // the rolled catch while reeling / showing
  reel: null,
  holding: false,
  target: { x: 0.66, y: 0.45 },   // where the bobber lands, as fractions of the water
  result: null,           // Econ.land() output for the fish on show
  escapeWhy: "",
  rand: Math.random,

  // Wired by main.js.
  getState: () => null,
  getEvent: () => null,
  assist: () => false,
  canCast: () => true,
  on: {},

  emit(name, ...args) { const f = this.on[name]; if (f) f(...args); },

  reset() {
    this.phase = "idle"; this.t = 0; this.fish = null; this.reel = null;
    this.holding = false; this.result = null; this.nibbles = 0;
  },

  /* ---------- input ---------- */

  press() {
    switch (this.phase) {
      case "idle": case "show": case "escape":
        return this.cast();
      case "wait":
        this.emit("early");
        return false;
      case "bite":
        return this.hook();
      case "reel":
        this.holding = true;
        return true;
    }
    return false;
  },

  release() { this.holding = false; },

  cast() {
    if (this.phase === "escape" && this.t < 0.35) return false;   // let the moment land
    if (!this.canCast()) { this.emit("blocked"); return false; }
    const s = this.getState();
    this.phase = "cast"; this.t = 0;
    this.fish = null; this.reel = null; this.result = null; this.holding = false; this.nibbles = 0;
    this.target = { x: 0.52 + this.rand() * 0.3, y: 0.3 + this.rand() * 0.32 };
    this.waitFor = Econ.waitTime(s, this.rand, this.getEvent());
    s.stats.casts++;
    this.emit("cast");
    return true;
  },

  hook() {
    const s = this.getState(), ev = this.getEvent();
    this.fish = Econ.rollCatch(s, this.rand, ev);
    this.reel = Reel.make(Econ.reelParams(s, this.fish, ev, this.assist()), this.rand);
    this.phase = "reel"; this.t = 0;
    this.holding = true;          // the tap that hooked it counts as the first pull
    this.emit("hook", this.fish);
    return true;
  },

  /* ---------- time ---------- */

  update(dt) {
    if (!(dt > 0)) return;
    this.t += dt;
    const s = this.getState();
    if (s) s.stats.secs += dt;

    switch (this.phase) {
      case "cast":
        if (this.t >= CAST_TIME) { this.phase = "wait"; this.t = 0; this.emit("splash"); }
        break;
      case "wait":
        if (this.t >= this.waitFor) { this.phase = "bite"; this.t = 0; this.emit("bite", this.nibbles); }
        break;
      case "bite": {
        const window = BITE_WINDOW + (this.assist() ? 0.8 : 0);
        if (this.t >= window) {
          this.nibbles++;
          if (this.nibbles >= MAX_NIBBLES) this.escape("swam");
          else { this.phase = "wait"; this.t = 0; this.waitFor = 0.7 + this.rand() * 1.1; this.emit("missed", this.nibbles); }
        }
        break;
      }
      case "reel": {
        const done = Reel.step(this.reel, dt, this.holding);
        if (done === "landed") this.land();
        else if (done) this.escape(done);
        break;
      }
      case "escape":
        if (this.t >= ESCAPE_TIME) { this.phase = "idle"; this.t = 0; }
        break;
    }
  },

  land() {
    const s = this.getState();
    this.result = Econ.land(s, this.fish, Date.now());
    this.phase = "show"; this.t = 0; this.holding = false;
    this.emit("landed", this.fish, this.result);
  },

  escape(why) {
    const s = this.getState();
    if (s) s.stats.escaped++;
    this.escapeWhy = why;
    this.phase = "escape"; this.t = 0; this.holding = false;
    this.emit("escaped", why, this.fish);
  },
};
