(function (root) {
  "use strict";
  const W = root.WeeklyVegas;
  const num = (n) => typeof n === "number" && Number.isFinite(n);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const OUT = /^(O|OUT|IR|SSPD|SUSP|SUSPENDED|PUP|NA)$/i;
  const RISKY = /^(D|DOUBTFUL|Q|QUESTIONABLE)$/i;
  const SLOTS = {
    QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], "D/ST": ["DST"], DST: ["DST"],
    FLEX: ["RB", "WR", "TE"], "RB/WR": ["RB", "WR"], "WR/TE": ["WR", "TE"], "RB/WR/TE": ["RB", "WR", "TE"], OP: ["QB", "RB", "WR", "TE"], "QB/RB/WR/TE": ["QB", "RB", "WR", "TE"],
  };
  const isBench = (slot) => /^(BENCH|BE)$/i.test(String(slot || "").trim());
  const isIR = (slot) => /^IR$/i.test(String(slot || "").trim());

  // Weather: what it is, how bad it is, and the kicker adjustment it implies.
  // Player props already price in the forecast, so only the team-total-based K estimate is adjusted.
  function weather(game, wx) {
    if (!game) return null;
    if (game.indoor) return { indoor: true, severity: 0, chips: [{ text: "Dome", tone: "neutral" }], kickAdj: 0.4, summary: `Indoors at ${game.venue || "a dome"}` };
    const chips = [];
    let severity = 0, kickAdj = 0;
    const wind = wx?.windMph, gust = wx?.gustMph, rain = wx?.precipProb, temp = wx?.tempF ?? game.forecast?.tempF;
    if (num(wind)) {
      if (wind >= 20 || gust >= 35) { severity = 2; kickAdj -= 2; } else if (wind >= 15 || gust >= 28) { severity = Math.max(severity, 1); kickAdj -= 1.2; } else if (wind >= 10) kickAdj -= 0.4;
      if (wind >= 10 || gust >= 25) chips.push({ text: `Wind ${Math.round(wind)} mph${num(gust) && gust >= wind + 8 ? `, gusts ${Math.round(gust)}` : ""}`, tone: severity >= 2 ? "bad" : severity ? "warn" : "neutral" });
    }
    if (num(rain) && rain >= 50) {
      const heavy = num(wx.precipIn) && wx.precipIn >= 0.25;
      if (heavy) { severity = Math.max(severity, 1); kickAdj -= 0.5; }
      chips.push({ text: `${num(temp) && temp <= 33 ? "Snow" : "Rain"} ${Math.round(rain)}%`, tone: heavy ? "warn" : "neutral" });
    }
    if (num(temp) && temp <= 25) { severity = Math.max(severity, 1); kickAdj -= 0.5; chips.push({ text: `${Math.round(temp)}°F`, tone: "warn" }); }
    if (!chips.length) chips.push({ text: num(temp) ? `Outdoors ${Math.round(temp)}°F` : "Outdoors", tone: "neutral" });
    const parts = [game.forecast?.summary, num(temp) ? `${Math.round(temp)}°F` : "", num(wind) ? `wind ${Math.round(wind)} mph` : "", num(rain) ? `${Math.round(rain)}% precip` : ""].filter(Boolean);
    return { indoor: false, severity, chips, kickAdj, summary: `${game.venue || "Outdoors"}${parts.length ? ` · ${parts.join(", ")}` : ""}${wx ? "" : " (detailed forecast not available yet)"}` };
  }

  // Team totals turn into rough K/DST points. Coefficients are fit to typical ESPN standard scoring.
  function kicker(game, wx) {
    if (!num(game?.impliedTeamTotal)) return null;
    return { points: clamp(2.6 + 0.24 * game.impliedTeamTotal + (wx?.kickAdj || 0), 3, 15), sd: 4 };
  }
  function defense(game) {
    if (!num(game?.impliedTeamTotal) || !num(game?.gameOverUnder)) return null;
    const opponentTotal = game.gameOverUnder - game.impliedTeamTotal;
    return { points: clamp(14 - 0.4 * opponentTotal, 1, 14), sd: 5, opponentTotal };
  }
  // Spread of outcomes: yardage noise scales with the projection; touchdowns add lumpy variance.
  function spread(points, player, source) {
    if (!num(points)) return null;
    if (source === "espn") return Math.max(2, 0.45 * points + 1);
    const td = num(player?.tdExp) ? player.tdExp : points / 12, passTd = num(player?.passTdExp) ? player.passTdExp : 0;
    return Math.max(2, Math.sqrt((0.27 * points) ** 2 + 36 * td + 16 * passTd));
  }

  // identity: what ESPN shows for a player (name, espnId, position, team, slot, status, locked, espnProj, bye).
  // ctx: { players: weekly Vegas players, games: { TEAM: game }, weather: { TEAM: wx }, now }.
  function project(identity, ctx = {}) {
    const now = ctx.now ?? Date.now();
    const position = identity.position;
    const game = identity.team ? ctx.games?.[identity.team] || null : null;
    // ESPN prints *BYE* in the opponent column; trust that rather than guessing from a missing game.
    const bye = Boolean(identity.bye);
    const wx = weather(game, ctx.weather?.[identity.team]);
    const out = OUT.test(identity.status || "") || isIR(identity.slot);
    const base = { ...identity, game, weather: wx, bye, out, risky: RISKY.test(identity.status || ""), kickoff: game?.kickoff || null };
    const candidate = W.match(ctx.players || [], identity);
    const player = candidate && (!position || candidate.position === position) ? candidate : null;
    base.kickoff = base.kickoff || player?.kickoff || null;
    base.locked = Boolean(identity.locked) || (base.kickoff ? Date.parse(base.kickoff) <= now : false);
    const espn = num(identity.espnProj) ? identity.espnProj : null;
    const result = (points, sd, source, detail) => ({ ...base, player, points, sd, source, detail });
    if (bye) return result(null, null, "bye", "Bye week");
    if (position === "K" || position === "DST") {
      const est = position === "K" ? kicker(game, wx) : defense(game);
      if (est) return result(est.points, est.sd, "est", position === "K" ? `Estimated from ${identity.team}'s implied total of ${game.impliedTeamTotal.toFixed(1)}${wx?.kickAdj ? `, ${wx.kickAdj > 0 ? "+" : ""}${wx.kickAdj.toFixed(1)} for conditions` : ""}` : `Estimated from opponent ${game.opponent}'s implied total of ${est.opponentTotal.toFixed(1)}`);
      if (espn !== null) return result(espn, spread(espn, null, "espn"), "espn", "No betting line yet, so this is ESPN's projection");
      return result(null, null, null, "No betting line or ESPN projection yet");
    }
    const vegas = W.projection(player).points;
    if (num(vegas) && player?.partial && espn !== null && espn > vegas) return result(espn, spread(espn, null, "espn"), "espn", `Vegas lines incomplete (${vegas.toFixed(1)}), so this is ESPN's projection`);
    if (num(vegas)) return result(vegas, spread(vegas, player, "vegas"), player?.partial ? "partial" : "vegas", player?.partial ? player.note : "Vegas player props");
    if (espn !== null) return result(espn, spread(espn, null, "espn"), "espn", player?.note ? `${player.note}, so this is ESPN's projection` : "No Vegas props for this player, so this is ESPN's projection");
    return result(null, null, null, player?.note || "No projection available");
  }

  // Best lineup for the open (unlocked) starter slots. tilt > 0 favors high-variance players, < 0 favors steady ones.
  function optimize(rows, tilt = 0) {
    const starters = rows.filter(r => SLOTS[String(r.slot).toUpperCase()]);
    const usable = (r) => !r.locked && !r.out && !r.bye && num(r.points) && !isIR(r.slot);
    // Small bonus for current starters so equal projections never produce a pointless swap.
    const value = (r) => r.points + tilt * (r.sd || 0) + (SLOTS[String(r.slot).toUpperCase()] ? 0.15 : 0);
    const fixed = starters.filter(r => r.locked);
    const open = starters.filter(r => !r.locked).map(r => String(r.slot).toUpperCase());
    // Only the best few at each position can ever start, which keeps the search tiny.
    const pool = rows.filter(usable);
    const byPos = {};
    for (const r of pool) (byPos[r.position] ||= []).push(r);
    const candidates = [];
    for (const [pos, list] of Object.entries(byPos)) {
      const room = open.filter(s => SLOTS[s].includes(pos)).length;
      candidates.push(...list.sort((a, b) => value(b) - value(a)).slice(0, room));
    }
    const order = open.map((slot, i) => ({ slot, i, n: candidates.filter(c => SLOTS[slot].includes(c.position)).length })).sort((a, b) => a.n - b.n);
    const memo = new Map();
    function best(k, mask) {
      if (k === order.length) return { score: 0, picks: [] };
      const key = `${k}:${mask}`;
      if (memo.has(key)) return memo.get(key);
      let top = { score: -Infinity, picks: [] };
      const { slot } = order[k];
      candidates.forEach((c, j) => {
        if (mask & (1 << j) || !SLOTS[slot].includes(c.position)) return;
        const rest = best(k + 1, mask | (1 << j));
        if (value(c) + rest.score > top.score) top = { score: value(c) + rest.score, picks: [{ slot, row: c }, ...rest.picks] };
      });
      const empty = best(k + 1, mask);
      if (empty.score > top.score) top = { score: empty.score, picks: [{ slot, row: null }, ...empty.picks] };
      memo.set(key, top);
      return top;
    }
    const picks = best(0, 0).picks;
    const startingNow = new Set(starters.filter(r => !r.locked).map(r => r));
    const chosen = new Set(picks.map(p => p.row).filter(Boolean));
    const points = (r) => (r && !r.out && !r.bye && num(r.points) ? r.points : 0);
    const currentTotal = starters.reduce((s, r) => s + points(r), 0);
    const optimalTotal = fixed.reduce((s, r) => s + points(r), 0) + [...chosen].reduce((s, r) => s + r.points, 0);
    const moves = {
      start: picks.filter(p => p.row && !startingNow.has(p.row)).map(p => ({ row: p.row, slot: p.slot })),
      bench: [...startingNow].filter(r => !chosen.has(r)),
    };
    const lineup = [...fixed.map(r => ({ slot: String(r.slot).toUpperCase(), row: r })), ...picks];
    return { lineup, currentTotal, optimalTotal, gain: optimalTotal - currentTotal, moves };
  }

  function summarize(starters) {
    const covered = starters.filter(r => num(r.points) && !r.out && !r.bye);
    return {
      mean: covered.reduce((s, r) => s + r.points, 0),
      variance: covered.reduce((s, r) => s + (r.sd || 0) ** 2, 0),
      covered: covered.length, count: starters.length,
      missing: starters.filter(r => !num(r.points) && !r.bye && !r.out && !/^(Empty|Empty slot)$/i.test(r.name)).length,
    };
  }
  function erf(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }
  function winProbability(a, b) {
    const sd = Math.sqrt(a.variance + b.variance);
    if (!sd) return a.mean === b.mean ? 0.5 : a.mean > b.mean ? 1 : 0;
    return 0.5 * (1 + erf((a.mean - b.mean) / (sd * Math.SQRT2)));
  }
  // Strategy: protect a lead with steady players, chase variance as an underdog.
  function tiltFor(mode, winProb) {
    if (mode === "safe") return -0.3;
    if (mode === "upside") return 0.4;
    if (mode === "max") return 0;
    if (!num(winProb)) return 0;
    return winProb >= 0.65 ? -0.3 : winProb <= 0.35 ? 0.4 : 0;
  }
  root.WeeklyVegasEstimates = { SLOTS, isBench, isIR, weather, kicker, defense, spread, project, optimize, summarize, winProbability, tiltFor };
})(globalThis);
