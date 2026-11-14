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
    }
    // The provider can list one player twice (e.g. old and new team after a signing), which used to
    // make validate() reject the whole refresh. Keep the copy that has lines, otherwise the first.
    const espnIdOf = p => p.playerImageUrl?.match(/\/players\/full\/(\d+)\.png/)?.[1];
    const byId = new Map();
    for (const p of rows) { const id = espnIdOf(p); if (id) byId.set(id, [...(byId.get(id) || []), p]); }
    const kept = rows.filter(p => {
      const group = byId.get(espnIdOf(p));
      if (!group || group.length < 2) return true;
      const withLines = group.filter(g => g.rowStatus !== "no_line");
      return (withLines.length === 1 ? withLines[0] : group[0]) === p;
    });
    return root.WeeklyVegas.validate({ season, week, scoring: "half-ppr", source: "Parlay Savant · weekly Vegas props", updatedAt: now.toISOString(), timestampKind: "retrieved", players: kept.map(p => {
      const kickoff = p.startsAt ? new Date(p.startsAt) : null;
      const seasonDate = kickoff && (kickoff.getUTCFullYear() === season || (kickoff.getUTCFullYear() === season + 1 && kickoff.getUTCMonth() === 0));
      const validKickoff = kickoff && Number.isFinite(kickoff.getTime()) && seasonDate ? kickoff.toISOString() : null;
      // "no_line" rows report 0 points only because no props are posted yet; that is not a projection.
      const noLine = p.rowStatus === "no_line";
      const missing = Array.isArray(p.missingLines) ? p.missingLines : [];
      const notes = [];
      if (noLine) notes.push("No Vegas lines posted yet");
      else if (missing.length) notes.push(`Partial: no ${missing.join(", ")} line${missing.length > 1 ? "s" : ""} posted, so this is likely low`);
      if (!validKickoff && !noLine) notes.push("Game time unavailable; confirm ESPN lineup lock before making a change.");
      return { name: p.playerName, position: p.position, team: p.team, espnId: espnIdOf(p), halfPprPoints: noLine ? null : p.halfPprPoints, unavailable: noLine, partial: !noLine && missing.length > 0, tdExp: Number.isFinite(p.touchdowns) ? p.touchdowns : null, passTdExp: Number.isFinite(p.passingTouchdowns) ? p.passingTouchdowns : null, kickoff: validKickoff, note: notes.join(" · ") };
    }) });
  }
  root.WeeklyVegasSource = { parse };
})(globalThis);
