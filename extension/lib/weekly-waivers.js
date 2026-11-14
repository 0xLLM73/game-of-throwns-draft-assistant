(function (root) {
  'use strict';
  function read(document) {
    const players = [], seen = new Set();
    for (const row of document.querySelectorAll('table tbody tr')) {
      const node = row.querySelector('.player__column[title]');
      const availability = row.querySelector('.roster-status')?.textContent.trim() || '';
      if (!node) continue;
      const name = node.getAttribute('title');
      const espnId = row.querySelector('.player-headshot img[src*="/players/full/"]')?.getAttribute('src')?.match(/\/players\/full\/(\d+)\.png/)?.[1] || null;
      const key = espnId || root.WeeklyVegas.normalize(name);
      if (!name || name === 'Player' || seen.has(key)) continue;
      seen.add(key);
      players.push({ name, espnId, availability, team: row.querySelector('.playerinfo__playerteam')?.textContent.trim() || '', position: row.querySelector('.playerinfo__playerpos')?.textContent.trim().replace('D/ST', 'DST'), status: row.querySelector('.playerinfo__injurystatus')?.textContent.trim() || '' });
    }
    return players;
  }
  function rank(players, data, options = {}) {
    const position = options.position || 'ALL', sort = options.sort || 'points';
    return players.filter(identity => position === 'ALL' || identity.position === position).map(identity => {
      const candidate = root.WeeklyVegas.match(data?.players || [], identity);
      const player = candidate && (!identity.position || identity.position === candidate.position) ? candidate : null;
      const linePlayer = player || (data?.players || []).find(p => p.team === identity.team && Number.isFinite(p.impliedTeamTotal));
      return { ...identity, points: root.WeeklyVegas.projection(player).points, kickoff: player?.kickoff, projectionPlayer: linePlayer };
    }).sort((a, b) => {
      const primaryA = sort === 'teamTotal' ? a.projectionPlayer?.impliedTeamTotal : a.points;
      const primaryB = sort === 'teamTotal' ? b.projectionPlayer?.impliedTeamTotal : b.points;
      return (primaryB ?? -Infinity) - (primaryA ?? -Infinity) || (b.points ?? -Infinity) - (a.points ?? -Infinity) || a.name.localeCompare(b.name);
    });
  }
  root.WeeklyVegasWaivers = { read, rank };
})(globalThis);
