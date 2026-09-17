// UI: every screen that isn't the fishing scene — shop, journal, business,
// goals, map, the haul receipt and statistics. It reads App.S (the live
// state) and asks App to do anything that changes it, so buying, selling and
// claiming all go through one place that saves and plays the sound.

const esc = (s) => GK.util.esc(String(s));

const UI = {
  shopTab: "rod",
  bizTab: "helpers",
  journalTab: "pond",

  el(id) { return document.getElementById(id); },

  money() {
    const txt = fmtMoney(Econ.cash(App.S));
    document.querySelectorAll("[data-money]").forEach((e) => { e.textContent = txt; });
  },

  /* ------------------------------------------------------------ effects in words */

  fxWords(track, fx) {
    if (!fx) return [];
    const pct = (v) => `+${Math.round(v * 100)}%`;
    const out = [];
    switch (track.cat) {
      case "rod": out.push(`Rare luck ×${fx.luck.toFixed(2)}`, `Bigger fish ×${fx.size.toFixed(2)}`); break;
      case "reel": out.push(`Green zone +${Math.round(fx.zone * 100)}`, `Reels ${Math.round((fx.speed - 1) * 100)}% faster`); if (fx.ease) out.push(`Fish ${Math.round(fx.ease * 100)}% calmer`); break;
      case "line": out.push(`Holds ${fx.kg} kg`); break;
      case "tackle": out.push(`Carries ${fx.cap} catches`); break;
      case "bait": {
        const b = fx.boost || {};
        for (const r of RARITY_ORDER) if (b[r]) out.push(`${RARITY[r].name} ×${b[r]}`);
        if (fx.odd) out.push(`Odd things ×${fx.odd}`);
        if (fx.size > 1) out.push(`Bigger fish ×${fx.size}`);
        if (!out.length) out.push("Plain and simple");
        break;
      }
      default:
        if (fx.perMin) out.push(`+${fmtMoney(fx.perMin)}/min`);
        if (fx.perSpecies) out.push(`+${fmtMoney(fx.perSpecies)}/min for each of your ${Object.keys(App.S.journal).length} discoveries`);
        if (fx.bait) out.push(`Bait ${pct(fx.bait)}`);
        if (fx.sell) out.push(`Sell prices ${pct(fx.sell)}`);
        if (fx.luckPct) out.push(`Rare luck ${pct(fx.luckPct)}`);
        if (fx.hours) out.push(`Earns +${fx.hours}h while away`);
        if (fx.all) out.push(`All income ${pct(fx.all)}`);
        if (fx.boats) out.push(`Boats earn ${pct(fx.boats)}`);
        if (fx.haul) out.push(`Haul +${fx.haul}`);
        if (fx.wait) out.push(`Bites ${Math.round(fx.wait * 100)}% sooner`);
        if (fx.auto) out.push("Auto-sells a full haul");
    }
    return out;
  },

  // A small picture for a track: people and boats are painted, gear is emoji.
  icon(track) {
    const wrap = document.createElement("div");
    wrap.className = "card-icon";
    const painted = ["reel", "line", "tackle"].includes(track.cat);
    if (track.helper || track.boat || track.id === "charter" || track.cat === "rod" || painted) {
      const cv = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = 64 * dpr; cv.height = 64 * dpr;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (track.helper) { Paint.drawPerson(ctx, track.id, 30, 64, 60, false); }
      else if (painted) Paint.icon(ctx, track.cat, 64);
      else if (track.cat === "rod") {
        const look = track.levels[Math.max(1, Econ.own(App.S, "rod")) - 1].look;
        Paint.wash(ctx, Paint.blob(32, 33, 27, 26, 3, 22, 0.05), "#e6efd9", { layers: 2, edge: 0.2 });
        const rod = () => { ctx.moveTo(12, 54); ctx.quadraticCurveTo(30, 36, 52, 10); };
        Paint.line(ctx, rod, 7, Paint.INK, 1);
        Paint.line(ctx, rod, 4, look.c, 1);
        Paint.line(ctx, () => { ctx.moveTo(44, 20); ctx.lineTo(52, 10); }, 2.4, look.tip, 1);
        Art.ellipse(ctx, 22, 46, 6, 6); ctx.fillStyle = "#c9ccd2"; ctx.fill(); ctx.strokeStyle = Paint.INK; ctx.lineWidth = 1.6; ctx.stroke();
      } else { ctx.translate(30, 46); Art.boat(ctx, track.id, 46, 0); }
      wrap.appendChild(cv);
    } else {
      wrap.textContent = track.emoji;
    }
    return wrap;
  },

  // One card for any purchasable track, used by the Shop and Business screens.
  trackCard(track) {
    const S = App.S;
    const n = Econ.own(S, track.id);
    const max = track.levels.length;
    const next = Econ.nextLevel(S, track.id);
    const chk = Econ.check(S, track.id);
    const card = document.createElement("div");
    card.className = "card";
    if (!next) card.classList.add("maxed");
    if (chk.reason === "locked") card.classList.add("locked");

    const isGear = ["rod", "reel", "line", "tackle"].includes(track.cat);
    const title = track.bait ? track.name
      : isGear ? levelName(track, Math.max(1, n))
      : track.name;
    let sub = "";
    if (isGear) sub = next ? `Next: ${levelName(track, n + 1)}` : "Best there is";
    else if (track.helper) sub = n ? `Level ${n} of ${max}` : "Not hired yet";
    else if (!track.bait) sub = n ? (max > 1 ? `Level ${n} of ${max}` : "Built") : "Not yet yours";

    const now = n ? this.fxWords(track, track.levels[n - 1].fx) : [];
    const nxt = next ? this.fxWords(track, next.fx) : [];
    const spans = (words, cls = "") => words.map((w) => `<span class="${cls}">${esc(w)}</span>`).join("");
    const fxHTML = !n ? spans(nxt, "up")
      : spans(now) + (nxt.length ? `<span class="up">▲ ${esc(nxt.join(" · "))}</span>` : "");

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="card-title">${esc(title)}</div>
      ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}
      ${track.quote ? `<div class="card-quote">“${esc(track.quote)}”</div>` : ""}
      <div class="card-what">${esc(track.what)}</div>
      <div class="card-fx">${fxHTML}</div>
      ${max > 1 ? `<div class="pips" aria-label="Level ${n} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>` : ""}`;

    const act = document.createElement("div");
    act.className = "card-action";
    if (track.bait && n) {
      if (S.bait === track.id) act.innerHTML = `<span class="tag-owned">✓ On the hook</span>`;
      else {
        const b = document.createElement("button");
        b.className = "btn blue wide use"; b.textContent = `🪝 Use ${track.name}`;
        b.onclick = () => App.useBait(track.id);
        act.appendChild(b);
      }
    } else if (!next) {
      act.innerHTML = `<span class="tag-owned">✓ ${max > 1 ? "Fully upgraded" : "Owned"}</span>`;
    } else if (chk.reason === "locked") {
      act.innerHTML = `<span class="why">🔒 Needs ${esc(chk.unmet.join(" and "))} · ${fmtMoney(next.cost)}</span>`;
    } else {
      const verb = track.helper ? (n ? "Train" : "Hire") : n && !isGear ? "Upgrade" : "Buy";
      const b = document.createElement("button");
      b.className = "btn buy" + (chk.ok ? "" : " short");
      b.innerHTML = chk.ok ? `${verb} · ${fmtMoney(next.cost)}` : `${fmtMoney(next.cost)} <small>· ${fmtMoney(chk.short)} to go</small>`;
      b.setAttribute("aria-label", chk.ok ? `${verb} ${title} for ${fmtMoney(next.cost)}` : `${fmtMoney(chk.short)} more needed`);
      b.onclick = () => App.buy(track.id);
      act.appendChild(b);
    }
    card.appendChild(this.icon(track));
    card.appendChild(body);
    card.appendChild(act);
    return card;
  },

  tabs(host, list, current, onPick, counts = {}) {
    host.innerHTML = "";
    for (const t of list) {
      const b = document.createElement("button");
      b.className = "tab" + (t.id === current ? " on" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", t.id === current);
      b.innerHTML = `${t.emoji} ${esc(t.name)}${counts[t.id] ? `<span class="n">${counts[t.id]}</span>` : ""}`;
      b.onclick = () => onPick(t.id);
      host.appendChild(b);
    }
  },

  // How many things on a tab can be bought right now (the little red number).
  affordable(cat) {
    return TRACKS.filter((t) => t.cat === cat && Econ.check(App.S, t.id).ok).length;
  },

  /* ------------------------------------------------------------ shop */

  renderShop() {
    const counts = Object.fromEntries(SHOP_TABS.map((t) => [t.id, this.affordable(t.id)]));
    this.tabs(this.el("shop-tabs"), SHOP_TABS, this.shopTab, (id) => { this.shopTab = id; this.renderShop(); }, counts);
    const hints = {
      rod: "A better rod finds rarer fish and bigger ones.",
      reel: "A better reel makes the green zone wider and lands fish faster.",
      line: "Fish heavier than your line fight much harder. Deeper water needs stronger line.",
      bait: "Pick which bait goes on the hook. Different bait brings up different things.",
      tackle: "Your haul has to fit in here until you sell it.",
      boats: "Boats earn money all the time — even while the game is closed.",
      helpers: "Helpers make everything better. Some earn money by themselves.",
      business: "Build up the harbour. Every building makes the whole business stronger.",
    };
    this.el("shop-hint").textContent = hints[this.shopTab] || "";
    const list = this.el("shop-list");
    list.innerHTML = "";
    TRACKS.filter((t) => t.cat === this.shopTab).forEach((t) => list.appendChild(this.trackCard(t)));
    this.money();
  },

  /* ------------------------------------------------------------ business */

  renderBusiness() {
    const S = App.S;
    const inc = Econ.income(S);
    this.el("income-card").innerHTML = `
      <div><small>Earning all the time</small><span class="big">${fmtMoney(inc.perMin)}</span> <small>per minute</small></div>
      <div><small>🧑‍🤝‍🧑 Helpers</small>${fmtMoney(inc.helpers)}/min</div>
      <div><small>⛵ Boats &amp; business</small>${fmtMoney(inc.boats)}/min</div>
      <div><small>💤 While you're away</small>up to ${Econ.offlineCapHours(S)} hours</div>`;
    const tabs = [
      { id: "helpers", name: "Helpers", emoji: "🧑‍🤝‍🧑" },
      { id: "boats", name: "Boats", emoji: "⛵" },
      { id: "business", name: "Buildings", emoji: "🏢" },
    ];
    const counts = Object.fromEntries(tabs.map((t) => [t.id, this.affordable(t.id)]));
    this.tabs(this.el("biz-tabs"), tabs, this.bizTab, (id) => { this.bizTab = id; this.renderBusiness(); }, counts);
    const list = this.el("biz-list");
    list.innerHTML = "";
    TRACKS.filter((t) => t.cat === this.bizTab).forEach((t) => list.appendChild(this.trackCard(t)));
    this.money();
    this.sizeHarbour();
  },

  sizeHarbour() {
    const cv = this.el("harbour");
    const r = cv.getBoundingClientRect();
    if (r.width < 50) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    }
  },

  drawHarbour(t) {
    const cv = this.el("harbour");
    if (!cv.width) return;
    const dpr = cv.width / Math.max(1, cv.getBoundingClientRect().width);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Scene.harbour(ctx, cv.width / dpr, cv.height / dpr, App.S, t);
  },

  /* ------------------------------------------------------------ journal */

  renderJournal(highlight) {
    const S = App.S;
    const found = Object.keys(S.journal).length;
    this.el("journal-count").textContent = `${found} / ${CATCHES.length}`;
    this.el("journal-fill").style.width = `${(found / CATCHES.length) * 100}%`;
    const tabs = [...LOCATIONS.map((l) => ({ id: l.id, name: l.name, emoji: l.emoji })), { id: "stats", name: "Records", emoji: "📊" }];
    this.tabs(this.el("journal-tabs"), tabs, this.journalTab, (id) => { this.journalTab = id; this.renderJournal(); });
    const body = this.el("journal-body");
    body.innerHTML = "";
    if (this.journalTab === "stats") { body.innerHTML = `<div class="stat-grid">${this.statsHTML()}</div>`; return; }

    const loc = LOCATION[this.journalTab];
    const list = CATCHES.filter((c) => c.loc === loc.id);
    const n = list.filter((c) => S.journal[c.id]).length;
    const head = document.createElement("div");
    head.className = "loc-head";
    head.innerHTML = `<span>${loc.emoji} ${esc(loc.name)}</span><span>${n} / ${list.length} found${S.locs[loc.id] ? "" : " · 🔒 not unlocked yet"}</span>`;
    body.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "species-grid";
    for (const c of list) {
      const j = S.journal[c.id];
      const b = document.createElement("button");
      b.className = `species rar-${c.rarity} ${j ? "found" : "unknown"}${highlight === c.id ? " fresh" : ""}`;
      b.appendChild(Art.sprite(c, 100, j ? (j.gold ? "gold" : "full") : "sil"));
      const nm = document.createElement("div");
      nm.className = "nm"; nm.textContent = j ? c.name : "???";
      const rr = document.createElement("div");
      rr.className = "rr"; rr.textContent = `${RARITY[c.rarity].badge} ${RARITY[c.rarity].name}`;
      b.append(nm, rr);
      b.setAttribute("aria-label", j ? `${c.name}, ${RARITY[c.rarity].name}` : `Undiscovered ${RARITY[c.rarity].name} catch`);
      b.onclick = () => this.openEntry(c.id);
      grid.appendChild(b);
    }
    body.appendChild(grid);
  },

  openEntry(id) {
    const S = App.S, c = CATCH[id], j = S.journal[id];
    const box = this.el("entry-box");
    box.className = `modal-box entry rar-${c.rarity}`;
    box.innerHTML = "";
    const art = Art.sprite(c, 280, j ? (j.gold ? "gold" : "full") : "sil");
    const img = document.createElement("canvas");
    img.width = art.width; img.height = art.height;
    img.getContext("2d").drawImage(art, 0, 0);
    box.appendChild(img);
    const info = document.createElement("div");
    const loc = LOCATION[c.loc];
    if (j) {
      info.innerHTML = `
        <h3>${esc(c.name)}</h3>
        <div class="rr">${RARITY[c.rarity].badge} ${RARITY[c.rarity].name}${c.odd ? " · not a fish" : ""}</div>
        <p class="desc">“${esc(c.desc)}”</p>
        <div class="entry-stats">
          <div><small>Found at</small>${loc.emoji} ${esc(loc.name)}</div>
          <div><small>Caught</small>${j.n} time${j.n === 1 ? "" : "s"}</div>
          <div><small>Size range</small>${fmtKg(c.kg[0])} – ${fmtKg(c.kg[1])}</div>
          <div><small>Your biggest</small>${fmtKg(j.kg)}</div>
          <div><small>Best price</small>${fmtMoney(j.val)}</div>
          <div><small>Golden ones</small>${j.gold ? `✨ ${j.gold}` : "none yet"}</div>
        </div>`;
    } else {
      info.innerHTML = `
        <h3>???</h3>
        <div class="rr">${RARITY[c.rarity].badge} ${RARITY[c.rarity].name}</div>
        <p class="desc">Something lives at ${loc.emoji} ${esc(loc.name)} that you haven't caught yet.
        ${RARITY[c.rarity].rank >= 2 ? "It's hard to find — better rods, bait and Old Jack all help." : "Keep casting!"}</p>`;
    }
    box.appendChild(info);
    const close = document.createElement("button");
    close.className = "btn sun wide"; close.textContent = "Close";
    close.onclick = () => GK.UI.closeModal("modal-entry");
    box.appendChild(close);
    GK.UI.openModal("modal-entry");
  },

  statsHTML() {
    const S = App.S, st = S.stats;
    const odd = CATCHES.filter((c) => c.odd);
    const rows = [
      ["🎣 Fish caught", st.caught.toLocaleString()],
      ["🎯 Casts", st.casts.toLocaleString()],
      ["💨 Got away", st.escaped.toLocaleString()],
      ["💰 Total earned", fmtMoney(S.cashEarned)],
      ["🐟 From fishing", fmtMoney(st.earnedFish)],
      ["⛵ From the business", fmtMoney(st.earnedIdle)],
      ["⚖️ Biggest fish", st.bestKg ? `${fmtKg(st.bestKg)} ${esc(CATCH[S.bestKgId] ? CATCH[S.bestKgId].name : "")}` : "—"],
      ["💎 Most valuable", st.bestVal ? `${fmtMoney(st.bestVal)} ${esc(CATCH[S.bestValId] ? CATCH[S.bestValId].name : "")}` : "—"],
      ["🧾 Best single sale", fmtMoney(st.bestSale)],
      ["📖 Species found", `${Object.keys(S.journal).length} / ${CATCHES.length}`],
      ["🗺️ Places unlocked", `${Object.keys(S.locs).length} / ${LOCATIONS.length}`],
      ["★ Rare fish", st.rares.toLocaleString()],
      ["🥾 Weird things", `${st.odds.toLocaleString()} (${odd.filter((c) => S.journal[c.id]).length}/${odd.length} kinds)`],
      ["✨ Golden fish", st.goldens.toLocaleString()],
      ["🐢 Turtles released", st.released.toLocaleString()],
      ["🎉 Events", st.events.toLocaleString()],
      ["🏆 Competitions won", `${st.compWins} / ${st.comps}`],
      ["⏱️ Time fishing", fmtDuration(st.secs)],
    ];
    return rows.map(([k, v]) => `<div><small>${k}</small>${v}</div>`).join("");
  },

  /* ------------------------------------------------------------ goals */

  renderGoals() {
    const S = App.S;
    const all = GOALS.map((g) => Econ.goal(S, g));
    const claimed = all.filter((x) => x.claimed).length;
    this.el("goals-count").textContent = `${claimed} / ${GOALS.length}`;
    const order = [...all.filter((x) => x.done && !x.claimed), ...all.filter((x) => !x.done), ...all.filter((x) => x.claimed)];
    const list = this.el("goal-list");
    list.innerHTML = "";
    const ready = all.filter((x) => x.done && !x.claimed);
    if (ready.length >= 2) {
      const b = document.createElement("button");
      b.className = "btn big sun wide collect-all";
      b.textContent = `🎁 Collect all ${ready.length} rewards`;
      b.onclick = () => App.claimAll();
      list.appendChild(b);
    }
    for (const x of order) {
      const g = x.g;
      const row = document.createElement("div");
      row.className = "goal" + (x.claimed ? " done-claimed" : x.done ? " claimable" : "");
      const reward = g.reward.bait && !Econ.own(S, g.reward.bait) ? `🎁 ${TRACK[g.reward.bait].name}` : `🎁 ${fmtMoney(g.reward.cash)}`;
      const prog = g.unit === "kg" ? `${fmtKg(x.cur)} / ${fmtKg(x.need)}` : g.unit === "$" || g.id.startsWith("earn") ? `${fmtMoney(x.cur)} / ${fmtMoney(x.need)}` : `${Math.floor(x.cur)} / ${x.need}`;
      row.innerHTML = `
        <div class="ge">${g.emoji}</div>
        <div>
          <div class="gn">${esc(g.name)}</div>
          <div class="gt">${esc(g.text)}${x.need > 1 && !x.claimed ? ` · ${prog}` : ""}</div>
          ${!x.claimed ? `<div class="gbar"><b style="width:${(x.cur / x.need) * 100}%"></b></div>` : ""}
          <div class="gr">${reward}</div>
        </div>`;
      const right = document.createElement("div");
      if (x.claimed) right.innerHTML = `<span class="tick" aria-label="Collected">✅</span>`;
      else if (x.done) {
        const b = document.createElement("button");
        b.className = "btn sun"; b.textContent = "Collect!";
        b.onclick = () => App.claim(g.id);
        right.appendChild(b);
      }
      row.appendChild(right);
      list.appendChild(row);
    }
  },

  /* ------------------------------------------------------------ map */

  // One painted postcard per location, painted once.
  lands: {},
  land(kind) {
    if (this.lands[kind]) return this.lands[kind];
    const cv = document.createElement("canvas");
    cv.width = 440; cv.height = 240;
    const ctx = cv.getContext("2d");
    ctx.scale(2, 2);
    Paint.landscape(ctx, 220, 120, kind);
    return (this.lands[kind] = cv);
  },

  renderMap() {
    const S = App.S;
    const list = this.el("map-list");
    list.innerHTML = "";
    for (const loc of LOCATIONS) {
      const owned = !!S.locs[loc.id];
      const chk = Econ.checkLoc(S, loc.id);
      const species = CATCHES.filter((c) => c.loc === loc.id);
      const found = species.filter((c) => S.journal[c.id]).length;
      const card = document.createElement("div");
      card.className = "place" + (owned ? "" : " locked");
      const sc = loc.scene;
      card.innerHTML = `
        <div class="place-art">
          <canvas width="440" height="240" aria-hidden="true"></canvas>
          <h3>${loc.emoji} ${esc(loc.name)}</h3>
          ${S.loc === loc.id ? `<span class="here">📍 You are here</span>` : ""}
        </div>
        <div class="place-body">
          <p>${esc(loc.blurb)}</p>
          <div class="place-meta">📖 ${found} / ${species.length} discovered</div>
        </div>`;
      card.querySelector(".place-art canvas").getContext("2d").drawImage(this.land(sc.kind), 0, 0);
      const bodyEl = card.querySelector(".place-body");
      const act = document.createElement("div");
      act.className = "card-action";
      if (owned) {
        const b = document.createElement("button");
        b.className = S.loc === loc.id ? "btn ghost wide" : "btn sun wide";
        b.textContent = S.loc === loc.id ? "🎣 Keep fishing here" : `⛵ Go fishing here`;
        b.onclick = () => App.travel(loc.id);
        act.appendChild(b);
      } else if (chk.reason === "locked") {
        act.innerHTML = `<span class="why">🔒 Needs ${esc(chk.unmet.join(" and "))} · then ${fmtMoney(loc.cost)}</span>`;
      } else {
        const b = document.createElement("button");
        b.className = "btn buy" + (chk.ok ? "" : " short");
        b.innerHTML = chk.ok ? `🔓 Unlock · ${fmtMoney(loc.cost)}` : `🔓 ${fmtMoney(loc.cost)} <small>· ${fmtMoney(chk.short)} to go</small>`;
        b.onclick = () => App.unlock(loc.id);
        act.appendChild(b);
      }
      bodyEl.appendChild(act);
      list.appendChild(card);
    }
    this.money();
  },

  /* ------------------------------------------------------------ haul */

  renderHaul() {
    const S = App.S, ev = App.ev;
    const lines = Econ.haulLines(S, ev);
    const host = this.el("haul-lines");
    host.innerHTML = "";
    if (!lines.length) host.innerHTML = `<div class="receipt-empty">Your haul is empty. Go catch something!</div>`;
    for (const l of lines) {
      const c = CATCH[l.id];
      const row = document.createElement("div");
      row.className = "rline";
      row.appendChild(Art.sprite(c, 48, l.gold ? "gold" : "full"));
      const nm = document.createElement("div");
      nm.innerHTML = `${l.n} × ${l.gold ? "✨ Golden " : ""}${esc(c.name)}<small>biggest ${fmtKg(l.bestKg)}</small>`;
      const v = document.createElement("b");
      v.textContent = fmtMoney(l.total);
      row.append(nm, v);
      host.appendChild(row);
    }
    this.el("haul-total").textContent = fmtMoney(Econ.haulValue(S, ev));
    const notes = [];
    const m = Econ.mods(S, ev);
    if (ev && ev.mods && ev.mods.sell) notes.push(`🍀 Lucky Day: everything +${Math.round((ev.mods.sell - 1) * 100)}%!`);
    const base = 1 + Econ.sumFx(S, "sell");
    if (base > 1) notes.push(`🧮 Better prices +${Math.round((base - 1) * 100)}%`);
    notes.push(`${S.haul.length} / ${m.capacity} in the box`);
    this.el("haul-note").textContent = notes.join(" · ");
    this.el("btn-sell").disabled = !S.haul.length;
  },
};
