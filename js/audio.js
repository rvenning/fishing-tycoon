// Sound: gamekit's synth core (lib/gk-audio.js) plus Fishing Tycoon's own
// noises and a relaxed ambient tune. Everything is synthesized.
//
// gk-audio has no master volume, so the game wraps tone/noise once: every call
// is scaled by the sound-effects slider, unless it is flagged `music`, which
// uses the music slider instead. Mute is the kit's own Sfx.enabled.

const Sfx = GK.Sfx;

const Volume = { sfx: 0.8, music: 0.6 };
{
  const tone = Sfx.tone.bind(Sfx), noise = Sfx.noise.bind(Sfx);
  Sfx.tone = (o) => {
    const k = o.music ? Volume.music : Volume.sfx;
    if (k <= 0.001) return;
    tone({ ...o, vol: (o.vol ?? 0.25) * k });
  };
  Sfx.noise = (o) => {
    if (Volume.sfx <= 0.001) return;
    noise({ ...o, vol: (o.vol ?? 0.2) * Volume.sfx });
  };
}

Object.assign(Sfx, {
  // Rod whipping back and the line singing out.
  cast() {
    this.noise({ dur: 0.18, vol: 0.08 });
    this.tone({ freq: 380, type: "sine", dur: 0.3, vol: 0.1, slide: 700 });
  },

  splash(big = 0) {
    this.noise({ dur: 0.25 + big * 0.2, vol: 0.16 + big * 0.1 });
    this.tone({ freq: 220 - big * 60, type: "sine", dur: 0.14, vol: 0.12, slide: -90 });
  },

  // The bobber going under: a bright double "bloop" so it cuts through.
  bite() {
    this.tone({ freq: 520, type: "sine", dur: 0.09, vol: 0.28, slide: -220 });
    this.tone({ freq: 760, type: "sine", dur: 0.11, vol: 0.24, slide: -300, when: 0.1 });
    this.noise({ dur: 0.12, vol: 0.12, when: 0.02 });
  },

  hook() {
    this.tone({ freq: 900, type: "triangle", dur: 0.06, vol: 0.18, slide: 300 });
  },

  // One click of the reel. `tension` 0..1 raises the pitch.
  reelTick(tension = 0.5) {
    this.tone({ freq: 1400 + tension * 900, type: "square", dur: 0.018, vol: 0.035 });
  },

  strain() {
    this.tone({ freq: 180, type: "sawtooth", dur: 0.08, vol: 0.05, slide: 30 });
  },

  snap() {
    this.tone({ freq: 1600, type: "square", dur: 0.05, vol: 0.14, slide: -1200 });
    this.noise({ dur: 0.2, vol: 0.12, when: 0.03 });
  },

  getaway() {
    [392, 330, 294].forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.16, vol: 0.13, when: i * 0.1 }));
  },

  catch(rank = 0) {
    const notes = [523, 659, 784, 1047, 1319].slice(0, 3 + Math.min(2, rank));
    notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.16, vol: 0.18, when: i * 0.07 }));
    this.splash(0.5);
  },

  // Rare and up: a shimmer on top of the catch jingle.
  rare() {
    [1319, 1568, 1976, 2637].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.3, vol: 0.11, when: 0.3 + i * 0.06 }));
  },

  legendary() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.26, vol: 0.18, when: 0.25 + i * 0.1 }));
    notes.forEach((f, i) => this.tone({ freq: f / 2, type: "sine", dur: 0.3, vol: 0.1, when: 0.25 + i * 0.1 }));
  },

  // A page turning in the journal and a little "new!" chime.
  discover() {
    this.noise({ dur: 0.12, vol: 0.05 });
    [988, 1319, 1760].forEach((f, i) => this.tone({ freq: f, type: "sine", dur: 0.2, vol: 0.12, when: 0.08 + i * 0.08 }));
  },

  personalBest() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, type: "square", dur: 0.08, vol: 0.07, when: 0.35 + i * 0.06 }));
  },

  // Coins cascading onto the counter; `n` drops, more for a bigger sale.
  coins(n = 6) {
    for (let i = 0; i < n; i++) {
      const f = 1500 + ((i * 373) % 700);
      this.tone({ freq: f, type: "square", dur: 0.05, vol: 0.06, when: i * 0.055 });
      this.tone({ freq: f * 1.5, type: "sine", dur: 0.08, vol: 0.05, when: i * 0.055 + 0.02 });
    }
  },

  buy() {
    this.tone({ freq: 660, type: "triangle", dur: 0.08, vol: 0.16 });
    this.tone({ freq: 990, type: "triangle", dur: 0.08, vol: 0.14, when: 0.07 });
    this.tone({ freq: 1320, type: "triangle", dur: 0.16, vol: 0.14, when: 0.14 });
  },

  unlock() {
    const notes = [392, 523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.3, vol: 0.17, when: i * 0.11 }));
    this.tone({ freq: 196, type: "sine", dur: 0.9, vol: 0.12, when: 0.1 });
  },

  claim() {
    this.coin();
    [880, 1175].forEach((f, i) => this.tone({ freq: f, type: "sine", dur: 0.14, vol: 0.12, when: 0.16 + i * 0.07 }));
  },

  eventStart() {
    [659, 880, 1175].forEach((f, i) => this.tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.14, when: i * 0.09 }));
  },

  thunder() {
    this.noise({ dur: 1.2, vol: 0.18 });
    this.tone({ freq: 70, type: "sine", dur: 1.1, vol: 0.16, slide: -20 });
  },

  nope() { this.tone({ freq: 240, type: "triangle", dur: 0.14, vol: 0.12, slide: -60 }); },
});

/* ------------------------------------------------------------------ music */
// A lazy pentatonic tune, re-keyed per location. Steps are eighth notes; the
// bass loops every 16 and the melody every 32, so they drift in and out of
// step with each other and it takes a while to hear it repeat. Scheduled on
// the audio clock with a lookahead pump, never one setTimeout per note.

const TUNE = {
  bass: [0, null, null, 7, null, null, 5, null, 3, null, null, 10, null, null, 7, null],
  lead: [12, null, 14, 16, null, 19, null, 16, 14, null, 12, null, 9, null, null, null,
         12, null, 16, 19, null, 21, 19, null, 16, null, 14, 12, null, 14, null, null],
  // A second, sparser verse for variety.
  lead2: [19, null, null, 16, null, 14, null, 12, null, null, 14, null, 16, null, null, null,
          21, null, 19, null, 16, null, 19, null, 14, null, 12, null, null, null, null, null],
};

const Music = {
  on: false,
  step: 0,
  nextT: 0,
  timer: null,
  root: 262,
  tempo: 76,
  LOOKAHEAD: 0.6,

  setLocation(loc) {
    this.root = loc.music.root;
    this.tempo = loc.music.tempo;
  },

  start() {
    if (!Sfx.ctx) Sfx.init();
    if (!Sfx.ctx) return;
    this.on = true;
    if (this.timer) return;
    this.nextT = Sfx.ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.pump(), 110);
  },

  stop() {
    this.on = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  pump() {
    if (!this.on || !Sfx.enabled || !Sfx.ctx || Volume.music <= 0.001) return;
    const now = Sfx.ctx.currentTime;
    const spb = 60 / this.tempo / 2;
    if (this.nextT < now - 0.25) this.nextT = now + 0.05;
    const hz = (semi) => (this.root / 2) * Math.pow(2, semi / 12);
    while (this.nextT < now + this.LOOKAHEAD) {
      const when = this.nextT - now;
      const b = TUNE.bass[this.step % 16];
      if (b !== null) Sfx.tone({ freq: hz(b) / 2, type: "triangle", dur: spb * 2.6, vol: 0.07, when, music: true });
      const verse = Math.floor(this.step / 64) % 2 ? TUNE.lead2 : TUNE.lead;
      const l = verse[this.step % 32];
      if (l !== null) {
        Sfx.tone({ freq: hz(l), type: "triangle", dur: spb * 1.5, vol: 0.05, when, music: true });
        Sfx.tone({ freq: hz(l) * 2, type: "sine", dur: spb * 0.6, vol: 0.012, when, music: true });
      }
      this.step++;
      this.nextT += spb;
    }
  },
};
