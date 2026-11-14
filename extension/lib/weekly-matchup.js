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
      const identity = root.WeeklyVegasDom.readRow(row);
      return identity && isStarterSlot(identity.slot) ? [identity] : [];
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
    // Live and postgame overview: each matchupTable has its own team label and one table of starters, bench and IR.
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
  function summarize(team, ctx) {
    const E = root.WeeklyVegasEstimates;
    const players = team.players.map(identity => identity.empty ? { ...identity, points: null, sd: null } : E.project(identity, ctx));
    const stats = E.summarize(players);
    // total = projected points; complete = every starter has a projection.
    return { ...team, players, ...stats, total: stats.mean, complete: stats.count > 0 && stats.covered + players.filter(p => p.bye || p.out).length === stats.count };
  }
  root.WeeklyVegasMatchup = { read, summarize, isStarterSlot };
})(globalThis);
