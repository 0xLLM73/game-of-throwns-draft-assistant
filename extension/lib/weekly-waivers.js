(function (root) {
  'use strict';
  function read(document) {
    const players = [], seen = new Set();
    for (const row of document.querySelectorAll('table tbody tr')) {
      const identity = root.WeeklyVegasDom.readRow(row);
      if (!identity || identity.empty) continue;
      const key = identity.espnId || root.WeeklyVegas.normalize(identity.name);
      if (seen.has(key)) continue;
      seen.add(key);
      // Waiver rows have no lineup slot; drop it so the first cell isn't mistaken for one.
      players.push({ ...identity, slot: '', locked: false, availability: row.querySelector('.roster-status')?.textContent.trim() || '' });
    }
    return players;
  }
  const STREAMABLE = new Set(['QB', 'TE', 'K', 'DST']);
  function rank(players, ctx, options = {}) {
    const E = root.WeeklyVegasEstimates;
    const position = options.position || 'ALL', sort = options.sort || 'points';
    const key = (r) => sort === 'teamTotal' ? r.game?.impliedTeamTotal : sort === 'ceiling' && r.points != null ? r.points + 1.28 * (r.sd || 0) : r.points;
    return players.filter(p => position === 'ALL' || (position === 'STREAM' ? STREAMABLE.has(p.position) : p.position === position))
      .map(identity => E.project(identity, ctx))
      .sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity) || (b.points ?? -Infinity) - (a.points ?? -Infinity) || a.name.localeCompare(b.name));
  }
  root.WeeklyVegasWaivers = { read, rank };
})(globalThis);
