(function (root) {
  "use strict";
  function weekFor(table) {
    return Number((table.querySelector('thead')?.textContent || '').match(/NFL Week (\d+)/i)?.[1]);
  }
  function isStarterSlot(slot) {
    return Boolean(slot) && !/^(bench|be|ir|reserve)$/i.test(slot.trim());
  }
  function playersFor(table) {
    return Array.from(table.querySelectorAll('tbody tr')).flatMap(row => {
      const node = row.querySelector('.player__column[title]');
      const slot = row.querySelector('td')?.textContent?.trim() || '';
      if (!node || !isStarterSlot(slot)) return [];
      const name = node.getAttribute('title');
      const position = row.querySelector('.playerinfo__playerpos')?.textContent.trim().replace('D/ST', 'DST');
      return [{ name: name === 'Player' ? 'Empty slot' : name, position, slot, status: row.querySelector('.playerinfo__injurystatus')?.textContent.trim() || '' }];
    });
  }
  function teamName(container, table) {
    const liveName = container?.querySelector('.team-name')?.textContent?.trim().replace(/\s+Box Score$/i, '');
    if (liveName) return liveName;
    const header = table.querySelector('thead th');
    return header?.getAttribute('title') || header?.textContent.trim();
  }
  function read(document) {
    // ESPN removes this wrapper when the matchup switches to its in-progress box-score layout.
    const scope = document.querySelector('.matchup-pregame-tables');
    if (scope) {
      const tables = Array.from(scope.querySelectorAll('table')).filter(t => Number.isFinite(weekFor(t)));
      if (tables.length === 2) return tables.map(table => ({ name: teamName(null, table), week: weekFor(table), players: playersFor(table) }));
    }

    // Live and postgame overview: each matchupTable contains its own team label and a
    // single table containing starters, bench, and IR. Filter by ESPN's slot column.
    const containers = Array.from(document.querySelectorAll('.boxscore-overview .matchupTable, .matchupTable'));
    const seen = new Set();
    const teams = [];
    for (const container of containers) {
      const table = container.querySelector('table');
      const week = table && weekFor(table);
      const name = table && teamName(container, table);
      if (!table || !Number.isFinite(week) || !name || seen.has(name)) continue;
      const players = playersFor(table);
      if (!players.length) continue;
      seen.add(name);
      teams.push({ name, week, players });
    }
    return teams.length === 2 ? teams : [];
  }
  function summarize(team, data) {
    const players = team.players.map(identity => {
      const candidate = root.WeeklyVegas.match(data?.players || [], identity);
      const matched = candidate && (!identity.position || candidate.position === identity.position) ? candidate : null;
      return { ...identity, points: root.WeeklyVegas.projection(matched).points, projectionPlayer: matched };
    });
    return { ...team, players, total: players.reduce((s, p) => s + (p.points ?? 0), 0), covered: players.filter(p => p.points !== null).length, complete: players.length > 0 && players.every(p => p.points !== null) };
  }
  root.WeeklyVegasMatchup = { read, summarize, isStarterSlot };
})(globalThis);
