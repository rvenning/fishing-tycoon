// Everything money can buy, as TRACKS: a track is a ladder of levels bought in
// order. Gear tracks start at level 1 already owned (your basic rod), the rest
// start at 0.
//
//   cat      which shop tab it lives on
//   start    levels owned in a brand-new game
//   levels   [{ name?, cost, fx, needs? }] — `fx` is read by js/game.js
//   needs    { trackId: level } or { locationId: 1 } — must be true to BUY
//
// Effect keys (fx), all additive or read as-is by Econ.mods():
//   luck       rod: multiplier on rare-and-up weights
//   size       rod/bait: bias toward the top of each size range
//   zone, speed, ease    reel: wider safe zone, faster landing, gentler fish
//   kg         line: strength — fish heavier than this fight harder
//   cap        tackle: haul capacity
//   boost      bait: { rarity: weight multiplier }
//   odd        bait: multiplier on oddities
//   perMin     passive dollars a minute
//   bait       +fraction of bait power
//   sell       +fraction on sale prices
//   luckPct    +fraction of luck
//   hours      +hours of offline earnings
//   boats      +fraction of boat income
//   haul       +haul capacity
//   wait       −fraction of the wait for a bite
//   auto       sells the haul by itself when it fills
//   all        +fraction of ALL passive income
//   perSpecies passive dollars a minute for every journal entry discovered

const SHOP_TABS = [
  { id: "rod", name: "Rods", emoji: "🎣" },
  { id: "reel", name: "Reels", emoji: "🌀" },
  { id: "line", name: "Line", emoji: "🧵" },
  { id: "bait", name: "Bait", emoji: "🪱" },
  { id: "tackle", name: "Tackle", emoji: "🧰" },
  { id: "boats", name: "Boats", emoji: "⛵" },
  { id: "helpers", name: "Helpers", emoji: "🧑‍🤝‍🧑" },
  { id: "business", name: "Business", emoji: "🏢" },
];

const TRACKS = [
  /* ---------------- gear ---------------- */
  { id: "rod", cat: "rod", start: 1, emoji: "🎣",
    what: "Better rods find rarer fish and bigger ones.",
    levels: [
      { name: "Basic Rod", cost: 0, fx: { luck: 1, size: 1 }, look: { c: "#8a5a32", tip: "#d8c8a8", len: 1 } },
      { name: "Fibreglass Rod", cost: 70, fx: { luck: 1.15, size: 1.15 }, look: { c: "#e8b43a", tip: "#fff2c8", len: 1.08 } },
      { name: "Carbon Rod", cost: 2400, fx: { luck: 1.35, size: 1.3 }, look: { c: "#2d2f36", tip: "#e04a3a", len: 1.14 } },
      { name: "Pro Rod", cost: 31000, fx: { luck: 1.6, size: 1.5 }, look: { c: "#1f5fae", tip: "#f2f2f2", len: 1.2 } },
      { name: "Deep-Sea Rod", cost: 360000, needs: { open: 1 }, fx: { luck: 1.9, size: 1.75 }, look: { c: "#0f3a4a", tip: "#ffcf3a", len: 1.16, thick: 1.5 } },
      { name: "Golden Rod", cost: 4000000, needs: { deep: 1 }, fx: { luck: 2.3, size: 2.0 }, look: { c: "#d9a21a", tip: "#fff7c0", len: 1.26, thick: 1.3, shine: true } },
    ] },

  { id: "reel", cat: "reel", start: 1, emoji: "🌀",
    what: "Smoother reels widen the green zone and land fish faster.",
    levels: [
      { name: "Basic Reel", cost: 0, fx: { zone: 0, speed: 1, ease: 0 } },
      { name: "Smooth Reel", cost: 45, fx: { zone: 0.04, speed: 1.15, ease: 0.04 } },
      { name: "Pro Reel", cost: 4200, fx: { zone: 0.08, speed: 1.3, ease: 0.09 } },
      { name: "Heavy Reel", cost: 62000, fx: { zone: 0.11, speed: 1.45, ease: 0.15 } },
      { name: "Titan Reel", cost: 770000, needs: { open: 1 }, fx: { zone: 0.14, speed: 1.6, ease: 0.22 } },
    ] },

  { id: "line", cat: "line", start: 1, emoji: "🧵",
    what: "Stronger line holds heavy fish without a fight, and opens deeper water.",
    levels: [
      { name: "Basic Line", cost: 0, fx: { kg: 4 } },
      { name: "Strong Line", cost: 220, fx: { kg: 12 } },
      { name: "Braided Line", cost: 11000, fx: { kg: 45 } },
      { name: "Deep-Sea Line", cost: 130000, needs: { pier: 1 }, fx: { kg: 220 } },
      { name: "Titanium Line", cost: 1300000, needs: { open: 1 }, fx: { kg: 1000 } },
    ] },

  { id: "tackle", cat: "tackle", start: 1, emoji: "🧰",
    what: "A bigger box carries a bigger haul between trips to the market.",
    levels: [
      { name: "Tin Box", cost: 0, fx: { cap: 6 } },
      { name: "Tackle Box", cost: 35, fx: { cap: 10 } },
      { name: "Big Tackle Box", cost: 940, fx: { cap: 15 } },
      { name: "Cool Box", cost: 14000, fx: { cap: 22 } },
      { name: "Ice Chest", cost: 180000, fx: { cap: 30 } },
      { name: "Captain's Hold", cost: 1800000, fx: { cap: 40 } },
    ] },

  /* ---------------- bait (each its own one-step track; you pick which to use) ---------------- */
  { id: "worms", cat: "bait", start: 1, bait: true, emoji: "🪱", name: "Worms",
    what: "Wriggly and free. Fish like them fine.",
    levels: [{ name: "Worms", cost: 0, fx: { boost: {}, size: 1 } }] },
  { id: "minnows", cat: "bait", start: 0, bait: true, emoji: "🐟", name: "Live Minnows",
    what: "Uncommon fish can't resist, and the big ones notice.",
    levels: [{ name: "Live Minnows", cost: 90, fx: { boost: { uncommon: 1.6, rare: 1.15 }, size: 1.12 } }] },
  { id: "lures", cat: "bait", start: 0, bait: true, emoji: "🪝", name: "Shiny Lures",
    what: "Flashy spinners that bring rare fish in for a look.",
    levels: [{ name: "Shiny Lures", cost: 3500, fx: { boost: { uncommon: 1.4, rare: 1.7, veryrare: 1.3 }, size: 1.2 } }] },
  { id: "magnet", cat: "bait", start: 0, bait: true, emoji: "🧲", name: "Magnet Bait",
    what: "Fish ignore it completely. Boots, keys and treasure do not.",
    levels: [{ name: "Magnet Bait", cost: 9200, needs: { river: 1 }, fx: { boost: {}, odd: 5, size: 1 } }] },
  { id: "premium", cat: "bait", start: 0, bait: true, emoji: "✨", name: "Premium Bait",
    what: "Hand-mixed secret recipe. Very rare fish come from miles away.",
    levels: [{ name: "Premium Bait", cost: 48000, fx: { boost: { uncommon: 1.3, rare: 1.9, veryrare: 1.8, legendary: 1.5 }, size: 1.3 } }] },
  { id: "deepbait", cat: "bait", start: 0, bait: true, emoji: "🔦", name: "Glow Bait",
    what: "Glows in the dark. The deepest, strangest fish follow the light.",
    levels: [{ name: "Glow Bait", cost: 530000, needs: { open: 1 }, fx: { boost: { uncommon: 1.3, rare: 2.1, veryrare: 2.3, legendary: 2.3 }, size: 1.45 } }] },

  /* ---------------- helpers ---------------- */
  { id: "sam", cat: "helpers", start: 0, helper: true, emoji: "🧢", name: "Sam",
    quote: "Has fished here since Tuesday.",
    what: "Fishes all day next to you and hands over what he catches.",
    levels: [
      { cost: 450, fx: { perMin: 12 } }, { cost: 2200, fx: { perMin: 32 } }, { cost: 9900, fx: { perMin: 80 } },
      { cost: 53000, fx: { perMin: 190 } }, { cost: 260000, fx: { perMin: 450 } },
    ] },
  { id: "mia", cat: "helpers", start: 0, helper: true, emoji: "🎒", name: "Mia",
    quote: "Never forgets the bait.",
    what: "Keeps your bait fresh, so it works harder.",
    levels: [
      { cost: 1400, fx: { bait: 0.25 } }, { cost: 7700, fx: { bait: 0.5 } }, { cost: 38000, fx: { bait: 0.8 } },
      { cost: 190000, fx: { bait: 1.2 } }, { cost: 960000, fx: { bait: 1.7 } },
    ] },
  { id: "penny", cat: "helpers", start: 0, helper: true, emoji: "🧮", name: "Penny",
    quote: "Runs the register and judges your fish.",
    what: "Haggles at the market. Every fish sells for more.",
    levels: [
      { cost: 4800, fx: { sell: 0.1 } }, { cost: 20000, fx: { sell: 0.2 } }, { cost: 96000, fx: { sell: 0.32 } },
      { cost: 430000, fx: { sell: 0.46 } }, { cost: 2200000, fx: { sell: 0.62 } },
    ] },
  { id: "jack", cat: "helpers", start: 0, helper: true, emoji: "🧓", name: "Old Jack",
    quote: "Claims he once caught a whale.",
    what: "Knows every secret spot. Rare fish turn up more often.",
    levels: [
      { cost: 12000, fx: { luckPct: 0.15 } }, { cost: 58000, fx: { luckPct: 0.3 } }, { cost: 240000, fx: { luckPct: 0.5 } },
      { cost: 1100000, fx: { luckPct: 0.75 } }, { cost: 4800000, fx: { luckPct: 1.05 } },
    ] },
  { id: "nana", cat: "helpers", start: 0, helper: true, emoji: "📒", name: "Nana Flo",
    quote: "Keeps the books. Naps professionally.",
    what: "Minds the business while you're away — it keeps earning for longer.",
    levels: [
      { cost: 38000, fx: { hours: 2, all: 0.05 } }, { cost: 170000, fx: { hours: 4, all: 0.1 } },
      { cost: 720000, fx: { hours: 6, all: 0.15 } }, { cost: 2900000, fx: { hours: 9, all: 0.2 } },
    ] },
  { id: "kofi", cat: "helpers", start: 0, helper: true, emoji: "🧭", name: "Skipper Kofi",
    quote: "Has never once been seasick. Mentions it often.",
    what: "Runs your boats properly. Every boat earns more.",
    levels: [
      { cost: 84000, needs: { smallboat: 1 }, fx: { boats: 0.2 } }, { cost: 340000, fx: { boats: 0.4 } },
      { cost: 1400000, fx: { boats: 0.65 } }, { cost: 5500000, fx: { boats: 0.95 } },
      { cost: 22000000, fx: { boats: 1.3 } },
    ] },

  /* ---------------- boats ---------------- */
  { id: "smallboat", cat: "boats", start: 0, boat: true, emoji: "⛵", name: "Small Boat",
    what: "A little dinghy with a crew of one. Earns steadily — and takes you to the Open Sea.",
    levels: [
      { cost: 13000, fx: { perMin: 45 } }, { name: "Small Boat · new sail", cost: 53000, fx: { perMin: 110 } },
      { name: "Small Boat · outboard motor", cost: 170000, fx: { perMin: 260 } },
    ] },
  { id: "fishingboat", cat: "boats", start: 0, boat: true, emoji: "🚤", name: "Fishing Boat",
    what: "A proper boat with nets and a wheelhouse.",
    levels: [
      { cost: 120000, needs: { smallboat: 1 }, fx: { perMin: 320 } },
      { name: "Fishing Boat · bigger nets", cost: 410000, fx: { perMin: 750 } },
      { name: "Fishing Boat · sonar", cost: 1200000, fx: { perMin: 1700 } },
    ] },
  { id: "trawler", cat: "boats", start: 0, boat: true, emoji: "🚢", name: "Trawler",
    what: "A big working ship. Brings in serious money — and it can reach the Deep Sea.",
    levels: [
      { cost: 770000, needs: { fishingboat: 1 }, fx: { perMin: 2100 } },
      { name: "Trawler · second crane", cost: 2400000, fx: { perMin: 4800 } },
      { name: "Trawler · night shift", cost: 7500000, fx: { perMin: 10500 } },
    ] },
  { id: "vessel", cat: "boats", start: 0, boat: true, emoji: "🛳️", name: "Deep-Sea Vessel",
    what: "A research-grade ship with submersible winches. The flagship.",
    levels: [
      { cost: 6600000, needs: { trawler: 1, deep: 1 }, fx: { perMin: 16000 } },
      { name: "Deep-Sea Vessel · submersible", cost: 22000000, fx: { perMin: 36000 } },
      { name: "Deep-Sea Vessel · fleet", cost: 66000000, fx: { perMin: 80000 } },
    ] },

  /* ---------------- facilities ---------------- */
  { id: "dock", cat: "business", start: 0, emoji: "⚓", name: "Fishing Dock",
    what: "Somewhere to tie up and unload. Boats earn more and you carry more.",
    levels: [
      { cost: 8400, needs: { river: 1 }, fx: { boats: 0.2, haul: 4 } },
      { name: "Fishing Dock · crane", cost: 67000, fx: { boats: 0.4, haul: 8 } },
      { name: "Fishing Dock · second berth", cost: 410000, fx: { boats: 0.6, haul: 12 } },
    ] },
  { id: "baitshop", cat: "business", start: 0, emoji: "🪱", name: "Bait Shop",
    what: "Your own bait shop. Better bait, and fish bite sooner.",
    levels: [
      { cost: 24000, needs: { dock: 1 }, fx: { bait: 0.3, wait: 0.1 } },
      { name: "Bait Shop · worm farm", cost: 160000, fx: { bait: 0.6, wait: 0.2 } },
      { name: "Bait Shop · secret recipes", cost: 910000, fx: { bait: 1.0, wait: 0.3 } },
    ] },
  { id: "market", cat: "business", start: 0, emoji: "🏪", name: "Fish Market",
    what: "Sell straight to customers. Better prices — and at level 2, your haul sells itself when it's full.",
    levels: [
      { cost: 58000, needs: { dock: 1 }, fx: { sell: 0.15 } },
      { name: "Fish Market · delivery van", cost: 360000, fx: { sell: 0.3, auto: 1 } },
      { name: "Fish Market · restaurant", cost: 2000000, fx: { sell: 0.5, auto: 1 } },
    ] },
  { id: "storage", cat: "business", start: 0, emoji: "🧊", name: "Refrigerated Storage",
    what: "A cold store by the dock. Carry far more, and the business earns for longer while you're away.",
    levels: [
      { cost: 140000, needs: { dock: 1 }, fx: { haul: 10, hours: 4 } },
      { name: "Refrigerated Storage · big freezer", cost: 770000, fx: { haul: 20, hours: 8 } },
      { name: "Refrigerated Storage · ice warehouse", cost: 3500000, fx: { haul: 35, hours: 12 } },
    ] },
  { id: "charter", cat: "business", start: 0, emoji: "🛥️", name: "Charter Business",
    what: "Take tourists out fishing. They pay handsomely, and mostly catch hats.",
    levels: [
      { cost: 380000, needs: { dock: 2, fishingboat: 1 }, fx: { perMin: 950 } },
      { name: "Charter Business · party boat", cost: 1300000, fx: { perMin: 2200 } },
      { name: "Charter Business · island tours", cost: 3600000, fx: { perMin: 5000 } },
    ] },
  { id: "aquarium", cat: "business", start: 0, emoji: "🐠", name: "Public Aquarium",
    what: "Show off everything in your journal. Visitors pay for every different catch you've discovered.",
    levels: [
      { cost: 260000, needs: { pier: 1, market: 1 }, fx: { perSpecies: 40 } },
      { name: "Public Aquarium · shark tunnel", cost: 2600000, fx: { perSpecies: 260 } },
      { name: "Public Aquarium · deep-sea wing", cost: 12000000, needs: { deep: 1 }, fx: { perSpecies: 900 } },
      { name: "Public Aquarium · world famous", cost: 38000000, fx: { perSpecies: 2400 } },
    ] },
  { id: "hq", cat: "business", start: 0, emoji: "🏰", name: "Harbour HQ",
    what: "The big one. A headquarters on the harbour with your name over the door. Everything earns more.",
    levels: [
      { cost: 75000000, needs: { vessel: 1, storage: 1, market: 1, charter: 1, aquarium: 1 }, fx: { all: 0.25 } },
    ] },
];

const TRACK = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

// The display name of a track at a given level (1-based).
function levelName(track, n) {
  const lv = track.levels[Math.max(0, Math.min(track.levels.length, n) - 1)];
  if (lv && lv.name) return lv.name;
  return track.name + (n > 1 ? ` · level ${n}` : "");
}
