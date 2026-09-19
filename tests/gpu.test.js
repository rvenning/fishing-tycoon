// Guards against drawing that is cheap in Safari and ruinous in Chrome.
//
// Chrome applies a canvas `ctx.filter` to EACH draw call as its own
// full-canvas off-screen pass. The pond's mirrored tree line was ~1,800 draw
// calls under `blur(1.5px)`, and on a desktop GPU that burst froze the whole PC
// (2026-09-19). The iPad never showed it. Soften by drawing small and scaling
// up instead.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./load.js");

test("no canvas ctx.filter anywhere in the game's scripts", () => {
  const dir = path.join(ROOT, "js");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const hits = src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /\.filter\s*=(?!=)/.test(l));
    assert.deepStrictEqual(hits, [], `${f} sets ctx.filter: ${hits.map(([n]) => "line " + n).join(", ")}`);
  }
});
