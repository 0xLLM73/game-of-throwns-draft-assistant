(function (root) {
  "use strict";
  const weights = { passingYards: 0.04, passingTDs: 4, interceptions: -2, rushingYards: 0.1, rushingTDs: 6, receptions: 0.5, receivingYards: 0.1, receivingTDs: 6, fumblesLost: -2, twoPointConversions: 2 };
  const normalize = (name) => String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const number = (n) => typeof n === "number" && Number.isFinite(n);
  function validate(input) {
    if (!input || input.scoring !== "half-ppr" || !Number.isInteger(input.season) || input.season < 2026 || !Number.isInteger(input.week) || input.week < 1 || input.week > 18) throw Error("Use scoring half-ppr, a season of 2026 or later, and week 1–18.");
    if (!input.source || typeof input.source !== "string" || !Number.isFinite(Date.parse(input.updatedAt)) || Date.parse(input.updatedAt) > Date.now() + 300000) throw Error("Provide a source and a valid source updatedAt timestamp (not in the future).");
    if (!Array.isArray(input.players) || !input.players.length || input.players.length > 3000) throw Error("Provide between 1 and 3000 players.");
    const seen = new Set();
    const players = input.players.map((p) => {
      if (!p || typeof p.name !== "string" || !p.name.trim() || !["QB", "RB", "WR", "TE", "K", "DST"].includes(p.position)) throw Error("Every player needs a name and QB/RB/WR/TE/K/DST position.");
      const key = p.espnId ? `id:${p.espnId}` : `${normalize(p.name)}:${p.position}:${p.team || ""}`;
      if (seen.has(key)) throw Error(`Duplicate player: ${p.name}`);
      seen.add(key);
      if (p.halfPprPoints != null && !number(p.halfPprPoints)) throw Error(`Invalid points for ${p.name}`);
      const stats = p.stats || {};
      for (const [stat, value] of Object.entries(stats)) {
        if (!Object.hasOwn(weights, stat) || !number(value) || value < 0) throw Error(`Invalid stat ${stat} for ${p.name}`);
      }
      if (p.halfPprPoints == null && !Object.keys(stats).length && !p.unavailable) throw Error(`Missing projection for ${p.name}`);
      return { name: p.name.trim(), position: p.position, team: String(p.team || ""), espnId: p.espnId ? String(p.espnId) : null, halfPprPoints: p.halfPprPoints ?? null, stats, unavailable: Boolean(p.unavailable), note: String(p.note || ""), kickoff: p.kickoff && Number.isFinite(Date.parse(p.kickoff)) ? new Date(p.kickoff).toISOString() : null };
    });
    return { season: input.season, week: input.week, scoring: "half-ppr", source: input.source, updatedAt: new Date(input.updatedAt).toISOString(), timestampKind: input.timestampKind === "retrieved" ? "retrieved" : "source", players };
  }
  function projection(player) {
    if (!player || player.unavailable) return { points: null, detail: player?.unavailable ? "Unavailable / bye" : "No weekly Vegas projection" };
    if (number(player.halfPprPoints)) return { points: player.halfPprPoints, detail: "Provider half-PPR projection" };
    const stats = player.stats || {};
    const required = player.position === "QB" ? ["passingYards", "passingTDs", "interceptions", "rushingYards", "rushingTDs"] : ["rushingYards", "rushingTDs", "receptions", "receivingYards", "receivingTDs"];
    if (["K", "DST"].includes(player.position)) return { points: null, detail: "Requires a provider projection matching your league scoring" };
    const missing = required.filter((key) => !number(stats[key]));
    const subtotal = Object.entries(weights).reduce((sum, [key, weight]) => sum + (number(stats[key]) ? stats[key] * weight : 0), 0);
    return { points: missing.length ? null : subtotal, detail: missing.length ? `Incomplete props: missing ${missing.join(", ")}` : "Prop-based estimate; unprovided fumbles and 2-point conversions omitted", subtotal, missing };
  }
  function match(players, identity) {
    if (identity.espnId) {
      const ids = players.filter((p) => p.espnId === String(identity.espnId));
      if (ids.length === 1) return ids[0];
    }
    const matches = players.filter((p) => normalize(p.name) === normalize(identity.name) && (!identity.espnId || !p.espnId));
    return matches.length === 1 ? matches[0] : null;
  }
  function forWeek(datasets, season, week) { return datasets?.[`${season}:${week}`] || null; }
  function lineupSuggestions(roster, data, now = Date.now()) {
    const slots = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], FLEX: ["RB", "WR", "TE"], "RB/WR": ["RB", "WR"], "WR/TE": ["WR", "TE"], K: ["K"], "D/ST": ["DST"], DST: ["DST"] };
    const rows = roster.map(identity => {
      const player = match(data?.players || [], identity);
      return { ...identity, slot: String(identity.slot).trim().toUpperCase(), position: identity.position || player?.position, points: projection(player).points,
        blocked: identity.locked || (player?.kickoff && Date.parse(player.kickoff) <= now) || /^(O|OUT|IR|SUSP|SUSPENDED|DOUBTFUL|D)$/i.test(identity.status || "") };
    });
    const suggestions = [];
    for (const bench of rows.filter(p => ["BE", "BENCH"].includes(p.slot) && !p.blocked && p.points !== null)) {
      for (const starter of rows.filter(p => slots[p.slot] && !p.blocked && p.points !== null)) {
        if (!slots[starter.slot].includes(bench.position) || bench.points - starter.points < 0.1) continue;
        suggestions.push({ bench, starter, gain: bench.points - starter.points });
      }
    }
    return suggestions.sort((a, b) => b.gain - a.gain);
  }
  root.WeeklyVegas = { weights, normalize, validate, projection, match, forWeek, lineupSuggestions };
})(globalThis);
