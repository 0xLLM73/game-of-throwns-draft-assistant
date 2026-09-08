(function (root) {
  "use strict";
  function read(document) {
    // Pregame starter tables contain the central position comparison. Bench tables do not.
    const scope = document.querySelector('.matchup-pregame-tables');
    if (!scope) return [];
    const tables = Array.from(scope.querySelectorAll('table')).filter(t => /NFL Week \d+/i.test(t.querySelector('thead')?.textContent || ''));
    if (tables.length !== 2) return [];
    return tables.map(table => ({
      name: table.querySelector('thead th')?.getAttribute('title') || table.querySelector('thead th')?.textContent.trim(),
      week: Number(table.querySelector('thead').textContent.match(/NFL Week (\d+)/i)?.[1]),
      players: Array.from(table.querySelectorAll('tbody tr')).flatMap(row => {
        const node = row.querySelector('.player__column[title]');
        if (!node) return [];
        const name = node.getAttribute('title');
        const position = row.querySelector('.playerinfo__playerpos')?.textContent.trim().replace('D/ST', 'DST');
        return [{ name: name === 'Player' ? 'Empty slot' : name, position, status: row.querySelector('.playerinfo__injurystatus')?.textContent.trim() || '' }];
      })
    }));
  }
  function summarize(team, data) {
    const players = team.players.map(identity => {
      const candidate = root.WeeklyVegas.match(data?.players || [], identity);
      const matched = candidate && (!identity.position || candidate.position === identity.position) ? candidate : null;
      return { ...identity, points: root.WeeklyVegas.projection(matched).points };
    });
    return { ...team, players, total: players.reduce((s, p) => s + (p.points ?? 0), 0), covered: players.filter(p => p.points !== null).length, complete: players.length > 0 && players.every(p => p.points !== null) };
  }
  root.WeeklyVegasMatchup = { read, summarize };
})(globalThis);
