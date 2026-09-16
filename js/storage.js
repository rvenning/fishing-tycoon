// Persistence: gamekit storage (lib/gk-storage.js) configured for Fishing Tycoon.
// ft_* localStorage keys, "fishingtycoon" Firestore collection.
//
// The progress object is the whole game state (see Econ.blank in js/game.js),
// and Econ.merge is the sync reconciler: monotonic counters take the max, and
// money is earned/spent counters so a spent dollar can never come back.

const PROGRESS = {
  blank: () => Econ.blank(),
  merge: (a, b) => Econ.merge(a, b),
};

const Storage = GK.createStorage({
  prefix: "ft",
  collection: "fishingtycoon",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

// Settings beyond the kit's own { sound, lastProfile }.
const SETTINGS_DEFAULTS = { music: 0.6, sfx: 0.8, reduceMotion: false, easyReel: false };

Object.assign(Storage, {
  // Always hand the game a normalized state, whatever is on disk.
  load(profileId) {
    let raw = null;
    try { raw = this.getProgress(profileId); } catch (e) { raw = null; }
    return Econ.normalize(raw);
  },

  prefs() {
    const s = this.getSettings();
    return { ...SETTINGS_DEFAULTS, ...s };
  },

  setPref(key, value) {
    const s = this.getSettings();
    s[key] = value;
    this.saveSettings(s);
  },
});
