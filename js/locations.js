// The six fishing spots, in progression order.
//
//   cost      dollars to unlock (the pond is free)
//   needs     other things that must be owned first — shown to the player as
//             plain words, so every lock says exactly what opens it
//   pace      seconds added to the wait for a bite (deep water is slower)
//   scene     palette + scenery switches for js/scene.js
//   music     root note (Hz) and mood for the ambient tune

const LOCATIONS = [
  {
    id: "pond", name: "Little Pond", emoji: "🪷", cost: 0, needs: {},
    blurb: "Lily pads, dragonflies and a bench with your name on it. Well, someone's name.",
    pace: 0,
    scene: { sky: ["#8fd3f4", "#e6f6ff"], water: ["#4fb3a4", "#2e7f78"], far: "#7fbf6a", near: "#5a9e48",
             ground: "#7a5a3a", kind: "pond" },
    music: { root: 262, tempo: 76 },
  },
  {
    id: "river", name: "River Bend", emoji: "🏞️", cost: 270, needs: {},
    blurb: "Quick water round a lazy bend. The fish here are pickier, and pay better.",
    pace: 0.2,
    scene: { sky: ["#9fd8f0", "#f2f9ec"], water: ["#5aa6c8", "#2f6f96"], far: "#6aa65a", near: "#4e8a44",
             ground: "#8a6a4a", kind: "river" },
    music: { root: 294, tempo: 82 },
  },
  {
    id: "lake", name: "Crystal Lake", emoji: "🏔️", cost: 3100, needs: { line: 2 },
    blurb: "Deep, cold and clear, under the mountains. Bigger fish need a stronger line.",
    pace: 0.4,
    scene: { sky: ["#a6c8ec", "#fbeedd"], water: ["#3d86b8", "#1f4f7e"], far: "#7a8fb0", near: "#3f7a5a",
             ground: "#6e6a5a", kind: "lake" },
    music: { root: 247, tempo: 72 },
  },
  {
    id: "pier", name: "Coastal Pier", emoji: "⚓", cost: 21000, needs: { line: 2 },
    blurb: "Salt air, seagulls, and a pier that creaks in a friendly way. The sea brings in odd things.",
    pace: 0.5,
    scene: { sky: ["#8ecae6", "#fff1d6"], water: ["#2f9ec4", "#17607f"], far: "#e8c89a", near: "#b88a5a",
             ground: "#9a7248", kind: "pier" },
    music: { root: 330, tempo: 86 },
  },
  {
    id: "open", name: "Open Sea", emoji: "🌊", cost: 140000, needs: { line: 3, smallboat: 1 },
    blurb: "Nothing but blue in every direction. You'll need a boat — and the fish out here are heavy.",
    pace: 0.8,
    scene: { sky: ["#6fb6ea", "#ffe8c8"], water: ["#1f7cc0", "#0c3f72"], far: "#9fc6e6", near: "#1f7cc0",
             ground: "#ffffff", kind: "open" },
    music: { root: 220, tempo: 70 },
  },
  {
    id: "deep", name: "Deep Sea", emoji: "🦑", cost: 1100000, needs: { line: 4, trawler: 1 },
    blurb: "Far past the shelf, under a sky full of stars. Strange lights move below.",
    pace: 1.1,
    scene: { sky: ["#10183a", "#3a3a78"], water: ["#122a5a", "#050c24"], far: "#1e2a5a", near: "#122a5a",
             ground: "#2a2a3a", kind: "deep" },
    music: { root: 196, tempo: 62 },
  },
];

const LOCATION = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
