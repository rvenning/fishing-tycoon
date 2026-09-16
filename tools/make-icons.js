// Generates Fishing Tycoon's PWA icons with the kit's PNG painter.
// A red-and-white bobber floating on bright sea, ripples spreading, a line
// running up out of frame — the moment just before a bite.
// Run: node tools/make-icons.js   (from the game folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const SKY = "#8ecae6", SKY_LO = "#cfeaf2", SEA = "#1f6f9e", SEA_DK = "#134b6e";
const RED = "#e8392e", RED_DK = "#a8231c", WHITE = "#fbfbf5", SUN = "#ffc93a";

function drawIcon(size, scale) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const horizon = big * 0.46;

  cv.fillRect(0, 0, big, horizon, SKY);
  cv.fillRect(0, horizon * 0.62, big, horizon * 0.38, SKY_LO, 0.6);
  cv.fillCircle(big * 0.78, big * 0.2, big * 0.09 * scale, SUN);
  cv.fillRect(0, horizon, big, big - horizon, SEA);
  cv.fillRect(0, big * 0.78, big, big * 0.22, SEA_DK, 0.55);

  const cx = big / 2, cy = big * 0.6;
  const r = big * 0.17 * scale;

  // ripples: thin light ellipse rings (outer ring, then sea colour inside)
  for (const k of [2.35, 1.75]) {
    cv.fillEllipse(cx, cy + r * 0.55, r * k, r * k * 0.3, "#ffffff", 0.5);
    cv.fillEllipse(cx, cy + r * 0.55, r * k - big * 0.012, r * k * 0.3 - big * 0.01, SEA);
  }

  // line from the top of the frame to the bobber's stem
  cv.fillRect(cx - big * 0.004, 0, big * 0.008, cy - r * 1.2, "#ffffff", 0.9);

  // bobber: red top half, white bottom half, drawn row by row
  cv.fillCircle(cx, cy, r + big * 0.012, RED_DK);
  for (let y = -r; y <= r; y++) {
    const w = Math.sqrt(Math.max(0, r * r - y * y));
    cv.fillRect(cx - w, cy + y, w * 2, 1.2, y < 0 ? RED : WHITE);
  }
  cv.fillRect(cx - r, cy - big * 0.006, r * 2, big * 0.012, RED_DK);
  cv.fillEllipse(cx - r * 0.38, cy - r * 0.5, r * 0.22, r * 0.14, "#ffffff", 0.75);
  cv.fillRect(cx - big * 0.012, cy - r * 1.25, big * 0.024, r * 0.3, "#3a3a3a");

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), drawIcon(512, 1.0));
fs.writeFileSync(path.join(out, "icon-192.png"), drawIcon(192, 1.0));
fs.writeFileSync(path.join(out, "maskable-512.png"), drawIcon(512, 0.8));
console.log("Fishing Tycoon icons written");
