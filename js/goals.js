// Goals: optional milestones with a reward you tap to collect.
//
// Every goal is `measure(s) -> number` against `need`, so the UI can draw a
// progress bar for all of them the same way. They are listed roughly in the
// order a player meets them; the fishing screen shows the first unclaimed one
// that is not already finished, so there is always a "next thing".
//
// Rewards are cash, sized to arrive when they still matter, or a free bait.
// A bait reward the player already owns turns into its cash value instead.

const speciesIn = (s, loc) => CATCHES.filter((c) => c.loc === loc && s.journal[c.id]).length;
const countWhere = (s, fn) => CATCHES.filter((c) => s.journal[c.id] && fn(c)).length;
const helpersHired = (s) => TRACKS.filter((t) => t.helper && (s.own[t.id] || 0) > 0).length;
const boatsOwned = (s) => TRACKS.filter((t) => t.boat && (s.own[t.id] || 0) > 0).length;

const GOALS = [
  { id: "first_fish", emoji: "🎣", name: "First catch", text: "Catch your very first fish", need: 1, measure: (s) => s.stats.caught, reward: { cash: 5 } },
  { id: "first_sale", emoji: "💰", name: "Open for business", text: "Sell a haul", need: 1, measure: (s) => s.stats.sales, reward: { cash: 10 } },
  { id: "first_upgrade", emoji: "🛒", name: "Kitted out", text: "Buy something from the shop", need: 1, measure: (s) => s.stats.bought, reward: { cash: 15 } },
  { id: "catch_10", emoji: "🐟", name: "Getting the hang of it", text: "Catch 10 fish", need: 10, measure: (s) => s.stats.caught, reward: { cash: 20 } },
  { id: "species_5", emoji: "📖", name: "Budding naturalist", text: "Discover 5 different catches", need: 5, measure: (s) => Object.keys(s.journal).length, reward: { cash: 25 } },
  { id: "earn_100", emoji: "💵", name: "Pocket money", text: "Earn $100 in total", need: 100, measure: (s) => s.cashEarned, reward: { cash: 20 } },
  { id: "trout", emoji: "🐠", name: "Trout spotter", text: "Discover a Trout", need: 1, measure: (s) => (s.journal.trout ? 1 : 0), reward: { bait: "minnows", cash: 90 } },
  { id: "pond_commons", emoji: "🪷", name: "Pond regular", text: "Catch every common fish in the Little Pond", need: 4,
    measure: (s) => countWhere(s, (c) => c.loc === "pond" && c.rarity === "common"), reward: { cash: 40 } },
  { id: "unlock_river", emoji: "🏞️", name: "Round the bend", text: "Unlock River Bend", need: 1, measure: (s) => (s.locs.river ? 1 : 0), reward: { cash: 50 } },
  { id: "big_5kg", emoji: "⚖️", name: "Heavyweight", text: "Catch a fish over 5 kg", need: 5, measure: (s) => s.stats.bestKg, reward: { cash: 60 }, unit: "kg" },
  { id: "old_boot", emoji: "🥾", name: "One careful owner", text: "Fish up the Old Boot", need: 1, measure: (s) => (s.journal.old_boot ? 1 : 0), reward: { cash: 40 } },
  { id: "first_helper", emoji: "🧢", name: "Hired help", text: "Hire your first helper", need: 1, measure: helpersHired, reward: { cash: 120 } },
  { id: "first_rare", emoji: "★", name: "Something special", text: "Catch a Rare (or rarer) fish", need: 1, measure: (s) => s.stats.rares, reward: { cash: 150 } },
  { id: "catch_50", emoji: "🧺", name: "Busy angler", text: "Catch 50 fish", need: 50, measure: (s) => s.stats.caught, reward: { cash: 150 } },
  { id: "earn_1000", emoji: "💵", name: "Four figures", text: "Earn $1,000 in total", need: 1000, measure: (s) => s.cashEarned, reward: { cash: 200 } },
  { id: "species_10", emoji: "📖", name: "Journal keeper", text: "Discover 10 different catches", need: 10, measure: (s) => Object.keys(s.journal).length, reward: { cash: 300 } },
  { id: "unlock_lake", emoji: "🏔️", name: "Up the mountain", text: "Unlock Crystal Lake", need: 1, measure: (s) => (s.locs.lake ? 1 : 0), reward: { cash: 900 } },
  { id: "big_sale", emoji: "🧾", name: "Market day", text: "Sell a single haul worth $1,000", need: 1000, measure: (s) => s.stats.bestSale, reward: { bait: "lures", cash: 700 }, unit: "$" },
  { id: "golden", emoji: "✨", name: "All that glitters", text: "Catch a golden fish", need: 1, measure: (s) => s.stats.goldens, reward: { cash: 400 } },
  { id: "odd_3", emoji: "🗝️", name: "Beachcomber", text: "Find 3 things that aren't fish", need: 3, measure: (s) => countWhere(s, (c) => c.odd), reward: { cash: 500 } },
  { id: "species_20", emoji: "📚", name: "Field guide", text: "Discover 20 different catches", need: 20, measure: (s) => Object.keys(s.journal).length, reward: { cash: 5000 } },
  { id: "earn_10k", emoji: "🏦", name: "Five figures", text: "Earn $10,000 in total", need: 10000, measure: (s) => s.cashEarned, reward: { cash: 3000 } },
  { id: "big_25kg", emoji: "🐋", name: "Whopper", text: "Catch a fish over 25 kg", need: 25, measure: (s) => s.stats.bestKg, reward: { cash: 4500 }, unit: "kg" },
  { id: "unlock_pier", emoji: "⚓", name: "Sea legs", text: "Unlock the Coastal Pier", need: 1, measure: (s) => (s.locs.pier ? 1 : 0), reward: { cash: 7000 } },
  { id: "first_boat", emoji: "⛵", name: "Captain", text: "Buy your first boat", need: 1, measure: boatsOwned, reward: { cash: 7000 } },
  { id: "win_comp", emoji: "🏆", name: "Champion", text: "Win gold in a fishing competition", need: 1, measure: (s) => s.stats.compWins, reward: { cash: 5000 } },
  { id: "catch_500", emoji: "🎏", name: "Seasoned angler", text: "Catch 500 fish", need: 500, measure: (s) => s.stats.caught, reward: { cash: 14000 } },
  { id: "helpers_4", emoji: "🧑‍🤝‍🧑", name: "The crew", text: "Hire 4 helpers", need: 4, measure: helpersHired, reward: { cash: 18000 } },
  { id: "pond_all", emoji: "🪷", name: "Pond complete", text: "Discover everything in the Little Pond", need: 10, measure: (s) => speciesIn(s, "pond"), reward: { cash: 12000 } },
  { id: "veryrare", emoji: "✦", name: "Once in a blue moon", text: "Catch a Very Rare catch", need: 1, measure: (s) => countWhere(s, (c) => c.rarity === "veryrare" && !c.w), reward: { cash: 1500 } },
  { id: "unlock_open", emoji: "🌊", name: "Out of sight of land", text: "Sail to the Open Sea", need: 1, measure: (s) => (s.locs.open ? 1 : 0), reward: { cash: 45000 } },
  { id: "earn_100k", emoji: "🏦", name: "Six figures", text: "Earn $100,000 in total", need: 100000, measure: (s) => s.cashEarned, reward: { cash: 30000 } },
  { id: "legendary", emoji: "👑", name: "Legend", text: "Catch a Legendary fish", need: 1, measure: (s) => countWhere(s, (c) => c.rarity === "legendary"), reward: { cash: 40000 } },
  { id: "species_35", emoji: "📚", name: "Naturalist", text: "Discover 35 different catches", need: 35, measure: (s) => Object.keys(s.journal).length, reward: { cash: 90000 } },
  { id: "big_100kg", emoji: "🐳", name: "Monster", text: "Catch a fish over 100 kg", need: 100, measure: (s) => s.stats.bestKg, reward: { cash: 90000 }, unit: "kg" },
  { id: "boats_3", emoji: "🚢", name: "A little fleet", text: "Own 3 kinds of boat", need: 3, measure: boatsOwned, reward: { cash: 280000 } },
  { id: "unlock_deep", emoji: "🦑", name: "Into the dark", text: "Reach the Deep Sea", need: 1, measure: (s) => (s.locs.deep ? 1 : 0), reward: { cash: 350000 } },
  { id: "earn_1m", emoji: "💎", name: "Millionaire", text: "Earn $1,000,000 in total", need: 1000000, measure: (s) => s.cashEarned, reward: { cash: 300000 } },
  { id: "odd_all", emoji: "🧭", name: "Treasure hunter", text: "Find every thing that isn't a fish", need: CATCHES.filter((c) => c.odd).length,
    measure: (s) => countWhere(s, (c) => c.odd), reward: { cash: 700000 } },
  { id: "helpers_all", emoji: "🎉", name: "Full staff room", text: "Hire every helper", need: TRACKS.filter((t) => t.helper).length, measure: helpersHired, reward: { cash: 900000 } },
  { id: "big_500kg", emoji: "🌞", name: "Unbelievable", text: "Catch something over 500 kg", need: 500, measure: (s) => s.stats.bestKg, reward: { cash: 1200000 }, unit: "kg" },
  { id: "earn_10m", emoji: "💎", name: "Tycoon", text: "Earn $10,000,000 in total", need: 10000000, measure: (s) => s.cashEarned, reward: { cash: 3000000 } },
  { id: "species_all", emoji: "🏅", name: "The complete journal", text: "Discover every catch in the game", need: CATCHES.length, measure: (s) => Object.keys(s.journal).length, reward: { cash: 12000000 } },
  { id: "hq", emoji: "🏰", name: "Harbour master", text: "Build the Harbour HQ", need: 1, measure: (s) => s.own.hq || 0, reward: { cash: 25000000 } },
];

const GOAL = Object.fromEntries(GOALS.map((g) => [g.id, g]));
