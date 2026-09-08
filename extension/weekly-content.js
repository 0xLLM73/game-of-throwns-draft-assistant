(async function () {
  "use strict";
  if (window.top !== window || document.getElementById("got-weekly-host")) return;
  const W = globalThis.WeeklyVegas;
  const host = document.createElement("div");
  host.id = "got-weekly-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host{position:fixed;right:16px;bottom:16px;z-index:99999;font:14px/1.45 system-ui,sans-serif;color:#e2e8f0}*{box-sizing:border-box}section{width:min(460px,calc(100vw - 32px));background:#0f1b2d;border:1px solid #475569;border-radius:14px;box-shadow:0 10px 35px #0006;padding:16px}header{display:flex;align-items:center;justify-content:space-between}h2{font-size:18px;margin:0}button,select,input{font:inherit;min-height:44px;border:1px solid #64748b;border-radius:6px;background:#152438;color:inherit;padding:6px}button{cursor:pointer}a{color:#86efac}label{display:inline-flex;gap:6px;align-items:center;margin-top:10px}input{width:85px}p{font-size:12px;color:#cbd5e1;margin:10px 0}.body{max-height:65vh;overflow:auto}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 4px;border-bottom:1px solid #334155;font-size:13px}small{display:block;color:#cbd5e1}td:last-child{white-space:nowrap}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #86efac} [hidden]{display:none}
    </style><section aria-label="Weekly Vegas lineup"><header><h2>Weekly Vegas · Half PPR</h2><button id="toggle" aria-expanded="true" type="button">Hide</button></header><div id="body" class="body"><label>Season <input id="season" type="number" min="2026" max="2100"></label> <label>Week <select id="week"></select></label><p id="context"></p><p><a id="import" target="_blank" rel="noopener">Add / refresh weekly projections</a></p><p id="status" role="status"></p><table><thead><tr><th>Player / slot</th><th>Vegas pts</th></tr></thead><tbody id="rows"></tbody></table><p>These are the players currently visible in ESPN’s lineup table, including bench players. Confirm the selected week matches ESPN. This panel does not submit lineup changes.</p></div></section>`;
  const $ = (id) => shadow.getElementById(id);
  const advice = document.createElement("div");
  advice.id = "lineup-advice";
  advice.setAttribute("aria-label", "Suggested lineup changes");
  $("rows").closest("table").before(advice);
  shadow.querySelector("style").textContent += "table,td,th{color:#e2e8f0}";
  $("import").href = chrome.runtime.getURL("weekly.html");
  const refresh = document.createElement("button");
  refresh.type = "button"; refresh.textContent = "Refresh from Vegas";
  $("context").before(refresh);
  refresh.onclick = async () => {
    refresh.disabled = true; refresh.textContent = "Refreshing…";
    try {
      const result = await chrome.runtime.sendMessage({ type: "got-weekly:refresh", season: Number($("season").value), week: Number($("week").value) });
      if (!result?.ok) throw Error(result?.reason || "Refresh failed; reload ESPN if you just updated the extension.");
      datasets = (await chrome.storage.local.get("weeklyVegasDatasets")).weeklyVegasDatasets || {};
      render(true);
    } catch (error) { $("status").textContent = error.message; }
    finally { refresh.disabled = false; refresh.textContent = "Refresh from Vegas"; }
  };
  $("import").onclick = async (event) => {
    event.preventDefault();
    try { await chrome.runtime.sendMessage({ type: "got-weekly:open" }); }
    catch { $("status").textContent = "Extension was reloaded. Refresh ESPN to reconnect, or open Weekly Vegas from extension settings."; }
  };
  const url = new URL(location.href);
  $("season").value = url.searchParams.get("seasonId") || new Date().getFullYear();
  for (let i = 1; i <= 18; i++) $("week").add(new Option(String(i), String(i)));
  // Only use an explicit ESPN scoring-period parameter. Otherwise require the user to choose.
  $("week").add(new Option("Choose week", ""), 0);
  $("week").value = url.searchParams.get("scoringPeriodId") || "";
  let datasets = (await chrome.storage.local.get("weeklyVegasDatasets")).weeklyVegasDatasets || {};
  const autoLabel = document.createElement("label");
  const auto = document.createElement("input");
  auto.type = "checkbox"; auto.id = "automatic"; auto.style.width = "auto";
  auto.checked = (await chrome.storage.local.get("weeklyVegasAutomatic")).weeklyVegasAutomatic !== false;
  autoLabel.append(auto, "Automatic week & refresh");
  const autoStatus = document.createElement("p");
  autoStatus.setAttribute("role", "status");
  refresh.before(autoLabel, autoStatus);
  let autoBusy = false;
  let nextAutoCheck = 0;
  let modeRevision = 0;
  async function checkAutomatic() {
    if (!auto.checked || autoBusy || document.hidden || !/^\/football\/(team|boxscore|players\/add)\/?$/.test(location.pathname) || Date.now() < nextAutoCheck) return;
    autoBusy = true;
    const revision = modeRevision;
    nextAutoCheck = Date.now() + 30000;
    try {
      const result = await chrome.runtime.sendMessage({ type: "got-weekly:auto" });
      if (!auto.checked || revision !== modeRevision) return;
      if (!result?.ok) throw Error(result?.reason || "Automatic refresh unavailable. Reload ESPN to reconnect.");
      $("season").value = result.season;
      $("week").value = result.week;
      datasets = (await chrome.storage.local.get("weeklyVegasDatasets")).weeklyVegasDatasets || {};
      autoStatus.textContent = `Automatic: ${result.season} Week ${result.week}. ${result.ended ? "" : `Next boundary: ${new Date(result.rolloverAt).toLocaleString()} (${result.boundary}). `}${result.warning || "Projections refresh hourly while this page is open."}`;
      render(true);
    } catch (error) { if (auto.checked && revision === modeRevision) autoStatus.textContent = error.message; }
    finally { autoBusy = false; }
  }
  async function setAutomatic(enabled) {
    modeRevision++;
    auto.checked = enabled;
    await chrome.storage.local.set({ weeklyVegasAutomatic: enabled });
    autoStatus.textContent = enabled ? "Checking the NFL schedule…" : "Manual week selected. Turn Automatic back on to follow the season.";
    nextAutoCheck = 0;
    render(true);
    void checkAutomatic();
  }
  auto.onchange = () => { void setAutomatic(auto.checked); };
  let lastFingerprint = "";
  let lastUrl = location.href;
  function roster() {
    const results = [];
    const seen = new Set();
    const scope = document.querySelector('[aria-label="Lineup"], .Roster');
    if (!scope) return results;
    for (const row of scope.querySelectorAll('tr, [role="row"]')) {
      const nameNode = row.querySelector('.player-column__athlete[title], .player__column[title], .playerinfo__playername, .AnchorLink[href*="/nfl/player/"], a[href*="playerId="]');
      if (!nameNode) continue;
      // ESPN's title survives other extensions adding research links inside the name.
      const name = (nameNode.getAttribute("title") || nameNode.textContent).trim();
      const link = nameNode.matches("a") ? nameNode : nameNode.querySelector("a");
      const href = link?.getAttribute("href") || "";
      const headshot = row.querySelector('.player-headshot img[src*="/players/full/"]')?.getAttribute("src") || "";
      const espnId = href.match(/(?:playerId=|\/id\/)(\d+)/)?.[1] || headshot.match(/\/players\/full\/(\d+)\.png/)?.[1] || null;
      const key = espnId || W.normalize(name);
      if (!name || /^(Player|Empty)$/i.test(name) || seen.has(key)) continue;
      seen.add(key);
      const slot = row.querySelector('td, [role="cell"]')?.textContent.trim() || "";
      const move = row.querySelector('button[aria-label^="Select "][aria-label$=" to move"]');
      results.push({ name, espnId, slot, position: row.querySelector('.playerinfo__playerpos')?.textContent.trim().replace("D/ST", "DST"), locked: Boolean(move?.disabled), status: row.querySelector('[title="Questionable"], [title="Out"], [title="Doubtful"], .playerinfo__playerstatus, .player-column__injury')?.textContent.trim() || "" });
    }
    return results;
  }
  function render(force = false) {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const nextUrl = new URL(lastUrl);
      if (!auto.checked) {
        $("season").value = nextUrl.searchParams.get("seasonId") || new Date().getFullYear();
        $("week").value = nextUrl.searchParams.get("scoringPeriodId") || "";
      }
    }
    host.hidden = !/^\/football\/(team|boxscore|players\/add)\/?$/.test(location.pathname);
    if (host.hidden) return;
    const matchup = location.pathname.includes('/boxscore');
    const waivers = location.pathname.includes('/players/add');
    shadow.querySelector('h2').textContent = waivers ? 'Vegas waiver wire · Half PPR' : matchup ? 'Vegas matchup · Half PPR' : 'Weekly Vegas · Half PPR';
    if (waivers) { renderWaivers(); return; }
    if (matchup) { renderMatchup(); return; }
    const players = roster();
    const data = W.forWeek(datasets, Number($("season").value), Number($("week").value));
    const fingerprint = JSON.stringify([location.href, players, data, $("season").value, $("week").value, Math.floor(Date.now() / 60000)]);
    if (!force && fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    const age = data ? (Date.now() - Date.parse(data.updatedAt)) / 3600000 : 0;
    $("context").textContent = data ? `${data.season} Week ${data.week} · ${data.source} · ${data.timestampKind === "retrieved" ? "Retrieved (source update time unknown)" : "Source updated"} ${new Date(data.updatedAt).toLocaleString()}${age > 24 ? " · STALE: more than 24 hours old; refresh before kickoff" : ""}` : "Choose a week and click Refresh from Vegas to load weekly projections.";
    let matched = 0;
    advice.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = "Suggested lineup changes";
    heading.style.fontSize = "14px";
    advice.append(heading);
    const scope = document.querySelector('[aria-label="Lineup"], .Roster');
    const displayedWeek = Array.from(scope?.querySelectorAll('th, td') || []).map(e => e.textContent.trim().match(/^NFL Week (\d+)$/i)?.[1]).find(Boolean);
    const weekMatches = Number(displayedWeek) === Number($("week").value);
    const changes = weekMatches ? W.lineupSuggestions(players, data) : [];
    const explanation = document.createElement("p");
    explanation.textContent = !weekMatches ? "Select the same week on ESPN and this panel to compare your lineup." : !data ? "Waiting for weekly projections." : changes.length ? "Possible one-for-one swaps, ordered by projected gain. These are alternatives—not a combined plan. Recheck injuries and ESPN eligibility before moving anyone." : "No higher-projected eligible bench swap found among players with data. Missing projections, IR and locked players are not compared.";
    advice.append(explanation);
    for (const change of changes.slice(0, 5)) {
      const card = document.createElement("p");
      card.style.cssText = "border-left:3px solid #86efac;padding:8px;background:#152438";
      card.textContent = `+${change.gain.toFixed(1)} pts · Start ${change.bench.name} (${change.bench.points.toFixed(1)}) instead of ${change.starter.name} (${change.starter.points.toFixed(1)}) at ${change.starter.slot}.${/^Q|QUESTIONABLE$/i.test(change.bench.status || "") ? " Questionable—check availability." : ""}`;
      advice.append(card);
    }
    $("rows").replaceChildren();
    players.forEach((identity) => {
      const player = W.match(data?.players || [], identity);
      const result = W.projection(player);
      if (result.points !== null) matched++;
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = `${identity.name} · ${identity.slot}${identity.status ? ` · ESPN ${identity.status}` : ""}`;
      const detail = document.createElement("small");
      detail.textContent = [result.detail, player?.note, player?.kickoff && Date.parse(player.kickoff) <= Date.now() ? "Game started; pregame estimate" : ""].filter(Boolean).join(" · ");
      name.append(detail);
      const points = document.createElement("td");
      points.textContent = result.points === null ? "—" : result.points.toFixed(1);
      row.append(name, points); $("rows").append(row);
    });
    $("status").textContent = players.length ? `${matched}/${players.length} visible players have weekly projections.` : "Waiting for ESPN’s lineup table. If no players appear, reload My Team; no roster has been inferred.";
  }
  function renderMatchup() {
    const teams = globalThis.WeeklyVegasMatchup.read(document);
    const data = W.forWeek(datasets, Number($("season").value), Number($("week").value));
    advice.replaceChildren(); $("rows").replaceChildren();
    $("context").textContent = data ? `${data.season} Week ${data.week} · ${data.source} · Retrieved ${new Date(data.updatedAt).toLocaleString()} · Source update time unknown` : 'No projections loaded for this week.';
    $("status").textContent = 'Pregame starter projections only—not a sportsbook matchup line or win probability. Bench excluded. Missing K/DST or other projections prevent a full-team winner call.';
    const note = document.createElement('p'); advice.append(note);
    if (teams.length !== 2) { note.textContent = 'Waiting for ESPN’s pregame starter comparison. Live/postgame layouts are not yet supported.'; return; }
    if (teams.some(t => t.week !== Number($("week").value))) { note.textContent = 'Choose the matchup’s week in this panel. Automatic may already show next week after Monday kickoff.'; return; }
    const totals = teams.map(t => globalThis.WeeklyVegasMatchup.summarize(t, data));
    const delta = totals[0].total - totals[1].total;
    note.textContent = totals.every(t => t.complete) ? Math.abs(delta) < 0.05 ? 'Projected tie.' : `${totals[delta > 0 ? 0 : 1].name} has the higher Vegas-derived total by ${Math.abs(delta).toFixed(1)} points.` : 'Incomplete coverage: showing available-player subtotals, not a projected winner.';
    for (const team of totals) {
      const heading = document.createElement('tr'), cell = document.createElement('th');
      cell.colSpan = 2; cell.textContent = `${team.name} · ${team.total.toFixed(1)} ${team.complete ? 'pts' : 'partial pts'} · ${team.covered}/${team.players.length} starters covered`;
      heading.append(cell); $("rows").append(heading);
      for (const player of team.players) {
        const row = document.createElement('tr'), name = document.createElement('td'), points = document.createElement('td');
        name.textContent = `${player.name} · ${player.position || 'empty'}${player.status ? ` · ${player.status}` : ''}`;
        points.textContent = player.points === null ? '—' : player.points.toFixed(1);
        row.append(name, points); $("rows").append(row);
      }
    }
  }
  function renderWaivers() {
    const data = W.forWeek(datasets, Number($("season").value), Number($("week").value));
    const players = globalThis.WeeklyVegasWaivers.rank(globalThis.WeeklyVegasWaivers.read(document), data);
    advice.replaceChildren(); $("rows").replaceChildren();
    $("context").textContent = data ? `${data.season} Week ${data.week} · ${data.source} · Retrieved ${new Date(data.updatedAt).toLocaleString()} · Source update time unknown` : 'Choose a week and refresh projections.';
    const note = document.createElement('p');
    note.textContent = 'Highest projected points among available players on this loaded ESPN page only. Use ESPN’s position/search filters and pagination to compare more players. This is a weekly points ranking—not a season-long value or waiver-priority recommendation. No claims are submitted.';
    advice.append(note);
    $("status").textContent = `${players.filter(p => p.points !== null).length}/${players.length} loaded available players have projections. Missing K/DST and other projections stay blank. Check injuries, game locks, and claim deadlines before adding.`;
    players.forEach((p, i) => {
      const row = document.createElement('tr'), name = document.createElement('td'), points = document.createElement('td');
      name.textContent = `${i + 1}. ${p.name} · ${p.position || '?'} · ${p.availability}${p.status ? ` · ${p.status}` : ''}`;
      if (p.kickoff && Date.parse(p.kickoff) <= Date.now()) { const note = document.createElement('small'); note.textContent = 'Game started; pregame estimate'; name.append(note); }
      points.textContent = p.points === null ? '—' : p.points.toFixed(1);
      row.append(name, points); $("rows").append(row);
    });
  }
  $("toggle").onclick = () => { $("body").hidden = !$("body").hidden; $("toggle").textContent = $("body").hidden ? "Show" : "Hide"; $("toggle").setAttribute("aria-expanded", String(!$("body").hidden)); };
  $("season").onchange = $("week").onchange = () => { void setAutomatic(false); };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.weeklyVegasDatasets) { datasets = changes.weeklyVegasDatasets.newValue || {}; render(true); } });
  document.body.append(host);
  render();
  void checkAutomatic();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { nextAutoCheck = 0; void checkAutomatic(); } });
  window.addEventListener("focus", () => { nextAutoCheck = 0; void checkAutomatic(); });
  // ESPN replaces roster rows and navigates without full page loads.
  let scheduled = false;
  new MutationObserver(() => { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; render(); }, 250); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(() => { render(); void checkAutomatic(); }, 30000);
})();
