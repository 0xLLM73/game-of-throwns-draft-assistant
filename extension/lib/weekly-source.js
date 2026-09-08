(function (root) {
  "use strict";
  // Decode the provider's published page data as JSON. Never execute downloaded scripts.
  function parse(html, season, week, now = new Date()) {
    let stream = "";
    for (const m of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)) {
      try { const packet = JSON.parse(m[1]); if (packet[0] === 1 && typeof packet[1] === "string") stream += packet[1]; } catch { /* Not a data packet. */ }
    }
    const start = stream.indexOf('{"initialWeek":');
    if (start < 0) throw Error("Weekly provider data is unavailable or its format changed. Saved projections were kept.");
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; i < stream.length; i++) {
      const char = stream[i];
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
      else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") { if (--depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw Error("Incomplete weekly provider response.");
    const data = JSON.parse(stream.slice(start, end));
    if (data.initialSeason !== season || data.initialWeek !== week || data.initialScoring !== "HALF_PPR" || data.initialPosition !== "ALL") throw Error("Provider returned a different season, week or scoring format. Saved projections were kept.");
    if (!Array.isArray(data.initialRows)) throw Error("Provider returned no weekly player list.");
    const rows = data.initialRows.filter(p => ["QB", "RB", "WR", "TE"].includes(p.position));
    if (rows.length < 5) throw Error("Provider returned too few weekly players. Try again once more props are published.");
    for (const p of rows) {
      if (p.week !== week || !Number.isFinite(p.halfPprPoints)) throw Error("Provider returned missing or mixed-week projections.");
      const kickoff = new Date(p.startsAt);
      const seasonDate = kickoff.getUTCFullYear() === season || (kickoff.getUTCFullYear() === season + 1 && kickoff.getUTCMonth() === 0);
      if (!p.startsAt || !Number.isFinite(kickoff.getTime()) || !seasonDate) throw Error("Provider returned invalid game dates.");
    }
    return root.WeeklyVegas.validate({ season, week, scoring: "half-ppr", source: "Parlay Savant · weekly Vegas props", updatedAt: now.toISOString(), timestampKind: "retrieved", players: rows.map(p => ({ name: p.playerName, position: p.position, team: p.team, espnId: p.playerImageUrl?.match(/\/players\/full\/(\d+)\.png/)?.[1], halfPprPoints: p.halfPprPoints, kickoff: p.startsAt, note: "Vegas-derived provider estimate; source update time unknown; lost fumbles and 2-point conversions not included" })) });
  }
  root.WeeklyVegasSource = { parse };
})(globalThis);
