// Progression diagnostic: how long does the whole game take a steady player?
//   node tools/progress.js [seed] [sessionMin] [breakHours]
// sessionMin 0 = one continuous run.
const { loadEngine, mulberry } = require("../tests/load.js");
const { makeBot } = require("../tests/bots.js");
const G = loadEngine();
const seed = +process.argv[2] || 1, sessionMin = +(process.argv[3] ?? 0), breakH = +(process.argv[4] ?? 0);
const rand = mulberry(seed);
const bot = makeBot(G, rand);
const E = G.Econ;
const hms = (t) => `${Math.floor(t / 3600)}h${String(Math.floor(t / 60) % 60).padStart(2, "0")}m`;
let lastLoc = "pond", stageStart = 0, stageFish = 0;
const report = [];
const limit = 14 * 3600;
while (bot.fishingTime < limit && !bot.s.own.hq) {
  const chunk = sessionMin ? sessionMin * 60 : 60;
  const before = bot.s.stats.earnedFish, idleBefore = bot.s.stats.earnedIdle;
  bot.play(chunk);
  if (sessionMin && breakH) bot.away(breakH * 3600);
  if (bot.s.loc !== lastLoc) {
    report.push(`${hms(bot.fishingTime)} fishing: -> ${bot.s.loc}  cash ${E.cash(bot.s)} perMin idle ${Math.round(E.perMin(bot.s))} species ${Object.keys(bot.s.journal).length}`);
    lastLoc = bot.s.loc;
  }
}
console.log(report.join("\n"));
console.log("--- purchases ---");
for (const [t, name, cost] of bot.log) console.log(`${hms(t).padStart(7)}  ${G.fmtMoney(cost).padStart(12)}  ${name}`);
const s = bot.s;
console.log("--- end ---");
console.log(`fishing ${hms(bot.fishingTime)} total ${hms(bot.time)} cash ${G.fmtMoney(E.cash(s))} earned ${G.fmtMoney(s.cashEarned)}`);
console.log(`fish ${G.fmtMoney(s.stats.earnedFish)} idle ${G.fmtMoney(s.stats.earnedIdle)} goals ${G.fmtMoney(s.stats.earnedGoals)} events ${G.fmtMoney(s.stats.earnedEvents)}`);
console.log(`caught ${s.stats.caught} escaped ${s.stats.escaped} casts ${s.stats.casts} species ${Object.keys(s.journal).length}/${G.CATCHES.length} goals ${Object.keys(s.goals).length}/${G.GOALS.length} comps ${bot.comps} wins ${bot.compWins}`);
const missing = G.CATCHES.filter((c) => !s.journal[c.id]).map((c) => c.id);
console.log("missing:", missing.join(" "));
const unowned = G.TRACKS.filter((t) => E.own(s, t.id) < t.levels.length).map((t) => `${t.id}:${E.own(s, t.id)}/${t.levels.length}`);
console.log("unfinished tracks:", unowned.join(" "));
