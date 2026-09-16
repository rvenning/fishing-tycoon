// One place that knows how to load Fishing Tycoon into Node.
//
// The game ships as plain <script> files with top-level `const` and no module
// system, so the suites run them through gamekit's vm harness. The order here
// must match index.html's.

const path = require("node:path");
const fs = require("node:fs");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

const ENGINE_FILES = [
  "tests/seed.js",
  "js/catches.js",
  "js/locations.js",
  "js/shop.js",
  "js/goals.js",
  "js/events.js",
  "js/game.js",
  "js/reel.js",
];

const ENGINE_EXPORTS = [
  "RARITY", "RARITY_ORDER", "CATCHES", "CATCH", "catchMid",
  "LOCATIONS", "LOCATION", "SHOP_TABS", "TRACKS", "TRACK", "levelName",
  "GOALS", "GOAL", "EVENTS", "EVENT", "COMP_MEDALS",
  "Econ", "START_CASH", "OFFLINE_BASE_HOURS", "OFFLINE_MAX_HOURS", "STAT_KEYS",
  "fmtMoney", "fmtKg", "fmtDuration", "BITE_WINDOW",
  "Reel", "reelBrain", "playReel",
  "__rand", "__reseed",
];

function loadEngine() {
  return loadScripts({ baseDir: ROOT, files: ENGINE_FILES, exports: ENGINE_EXPORTS });
}

function loadStorage() {
  return loadScripts({
    baseDir: ROOT,
    files: ["lib/gk-util.js", "lib/gk-storage.js", ...ENGINE_FILES.slice(1, 7), "js/storage.js"],
    exports: ["Storage", "PROGRESS", "Econ"],
    browser: true,
  });
}

function readSource(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

// A small seeded generator for code running OUTSIDE the sandbox.
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { ROOT, loadEngine, loadStorage, readSource, mulberry, ENGINE_FILES };
