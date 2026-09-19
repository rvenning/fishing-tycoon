// The painted world against the rules the scene code states for itself.
//
// Scene.bobberZone() is where the bobber lands, and a pale mark painted there
// reads as a dip. The water glints follow the sun's path, which runs straight
// through that zone, so each one must be skipped where it would overlap it.
// This paints every world at several screen sizes into a recording context and
// checks where the glint strokes actually went.

const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./load.js");

const GLINT = "rgba(255,244,201,0.28)";

function loadScene() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const recorder = (log) => {
    const st = { filter: "none", strokeStyle: "#000" };
    let x = 0;
    const base = {
      createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({}),
      measureText: (t) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      getImageData: (a, b, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      moveTo: (mx, my) => { x = [mx, my]; },
      quadraticCurveTo: (cx, cy, ex, ey) => { if (st.strokeStyle === GLINT && log) log.push({ x0: x[0], x1: ex, y: ey }); },
    };
    return new Proxy(st, {
      get: (t, k) => (k in base ? base[k] : k in st ? st[k] : k === "canvas" ? { width: 64, height: 64 } : noop),
      set: (t, k, v) => { st[k] = v; return true; },
    });
  };
  const canvas = () => ({ width: 0, height: 0, getContext: () => recorder(null), toDataURL: () => "", style: {} });
  const sandbox = {
    Math, console,
    window: { devicePixelRatio: 1 },
    document: { createElement: canvas, documentElement: { style: { setProperty() {} } }, fonts: null },
  };
  vm.createContext(sandbox);
  const files = ["catches", "locations", "shop", "goals", "events", "game", "paint", "art", "scene"];
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, "js", f + ".js"), "utf8")).join("\n;\n");
  vm.runInContext(src + "\n;this.Scene = Scene;", sandbox);
  return { Scene: sandbox.Scene, recorder };
}

test("no water glint is painted where the bobber lands", () => {
  const { Scene, recorder } = loadScene();
  let painted = 0;
  for (const [W, H] of [[1920, 1080], [1080, 810], [1024, 768], [390, 844], [844, 390]]) {
    for (const kind of ["pond", "river", "lake", "pier", "open"]) {
      Scene.W = W; Scene.H = H;
      const g = Scene.geom(), z = Scene.bobberZone(g), log = [];
      Scene.paintWorld(recorder(log), g, kind);
      painted += log.length;
      const inside = log.filter((s) => s.x1 > z.x0 && s.x0 < z.x1 && s.y > z.y0 && s.y < z.y1);
      assert.strictEqual(inside.length, 0, `${kind} at ${W}x${H}: ${inside.length} glint(s) inside the bobber zone`);
    }
  }
  assert.ok(painted > 100, `the recorder saw only ${painted} glints; the test is no longer watching them`);
});
