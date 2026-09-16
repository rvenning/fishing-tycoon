// When does a steady player reach each milestone? Several seeds, continuous play.
//   node tools/timeline.js [seeds=3]
const { loadEngine, mulberry } = require("../tests/load.js");
const { makeBot } = require("../tests/bots.js");
const G = loadEngine();
const hms = (t) => t === undefined ? "  -  " : `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, "0")}m`;
const n = +process.argv[2] || 3;
for (let seed = 1; seed <= n; seed++) {
  const bot = makeBot(G, mulberry(seed));
  while (bot.fishingTime < 20 * 3600 && !bot.s.own.hq) bot.play(60);
  const a = bot.at, s = bot.s;
  console.log(`seed ${seed}:`, ["river", "lake", "pier", "open", "deep"].map((k) => `${k} ${hms(a["loc:" + k])}`).join("  "),
    ` vessel ${hms(a["max:vessel"])} hq ${hms(bot.time)}`);
  console.log(`   fish ${G.fmtMoney(s.stats.earnedFish)} idle ${G.fmtMoney(s.stats.earnedIdle)} goals ${G.fmtMoney(s.stats.earnedGoals)} events ${G.fmtMoney(s.stats.earnedEvents)} purse ${G.fmtMoney(G.Econ.cash(s))}`,
    `species ${Object.keys(s.journal).length}/${G.CATCHES.length} goals ${Object.keys(s.goals).length}/${G.GOALS.length} comps ${bot.comps}/${bot.compWins}`);
}
