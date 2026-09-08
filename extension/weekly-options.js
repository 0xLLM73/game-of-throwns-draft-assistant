(async function () {
  "use strict";
  const W = globalThis.WeeklyVegas;
  const $ = (id) => document.getElementById(id);
  let pending = null;
  let datasets = (await chrome.storage.local.get("weeklyVegasDatasets")).weeklyVegasDatasets || {};
  $("entry-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const f = form.elements;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const season = Number(f.season.value), week = Number(f.week.value);
      const key = `${season}:${week}`;
      const stored = await chrome.storage.local.get(["weeklyVegasDatasets", "weeklyVegasBackups"]);
      const current = stored.weeklyVegasDatasets || {};
      const previous = current[key];
      const updatedAt = new Date(f.updated.value).toISOString();
      if (previous && (previous.source !== f.source.value.trim() || previous.updatedAt !== updatedAt)) throw Error("This week already has a different source or update time. Use bulk import to replace the complete snapshot so older players are not labeled fresh.");
      const player = { name: f.player.value.trim(), position: f.position.value, halfPprPoints: Number(f.points.value) };
      const oldMatches = (previous?.players || []).filter((p) => W.normalize(p.name) === W.normalize(player.name));
      if (oldMatches.length > 1) throw Error("Ambiguous player name; use bulk import with ESPN IDs.");
      const players = (previous?.players || []).filter((p) => W.normalize(p.name) !== W.normalize(player.name));
      players.push(player);
      const next = W.validate({ season, week, source: f.source.value.trim(), updatedAt, scoring: "half-ppr", players });
      const backups = stored.weeklyVegasBackups || {};
      if (previous) backups[key] = previous;
      datasets = { ...current, [key]: next };
      await chrome.storage.local.set({ weeklyVegasDatasets: datasets, weeklyVegasBackups: backups });
      renderWeeks(key); $("status").textContent = `Saved ${player.name} for Week ${week}.`;
      f.player.value = ""; f.points.value = "";
    } catch (error) { $("status").textContent = error.message; }
    finally { button.disabled = false; }
  };
  const example = { season: 2026, week: 1, scoring: "half-ppr", source: "SYNTHETIC EXAMPLE — replace before use", updatedAt: new Date().toISOString(), players: [{ name: "Example Running Back", position: "RB", team: "EX", stats: { rushingYards: 70.5, rushingTDs: 0.6, receptions: 3.5, receivingYards: 25.5, receivingTDs: 0.1 } }] };
  $("example").textContent = JSON.stringify(example, null, 2);
  $("example-button").onclick = () => { $("data").value = JSON.stringify(example, null, 2); invalidate(); };
  function invalidate() { pending = null; $("save").hidden = true; $("preview").textContent = ""; }
  $("data").oninput = invalidate;
  $("file").onchange = async () => {
    invalidate();
    const file = $("file").files[0];
    if (!file) return;
    if (file.size > 2000000) { $("status").textContent = "Choose a file smaller than 2 MB."; return; }
    $("data").value = await file.text();
  };
  $("import-form").onsubmit = (event) => {
    event.preventDefault(); invalidate();
    try {
      pending = W.validate(JSON.parse($("data").value));
      const covered = pending.players.filter((p) => W.projection(p).points !== null).length;
      $("preview").textContent = `${pending.season} · Week ${pending.week} · ${pending.source} · ${covered}/${pending.players.length} complete projections. Updated ${new Date(pending.updatedAt).toLocaleString()}. Saving replaces this week; its previous snapshot is kept as a rollback copy.`;
      $("save").hidden = false;
      $("status").textContent = "Review the week, source, and coverage above before saving.";
    } catch (error) { $("status").textContent = error.message; }
  };
  $("save").onclick = async () => {
    if (!pending) return;
    $("save").disabled = true;
    try {
      const key = `${pending.season}:${pending.week}`;
      const stored = await chrome.storage.local.get(["weeklyVegasDatasets", "weeklyVegasBackups"]);
      const current = stored.weeklyVegasDatasets || {};
      const backups = stored.weeklyVegasBackups || {};
      if (current[key]) backups[key] = current[key];
      datasets = { ...current, [key]: pending };
      await chrome.storage.local.set({ weeklyVegasDatasets: datasets, weeklyVegasBackups: backups });
      renderWeeks(key); invalidate(); $("status").textContent = "Saved locally. Open ESPN My Team and select this week in Weekly Vegas.";
    } catch (error) { $("status").textContent = `Save failed: ${error.message}`; }
    finally { $("save").disabled = false; }
  };
  function renderWeeks(selected) {
    $("weeks").replaceChildren();
    Object.keys(datasets).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).forEach((key) => $("weeks").add(new Option(key.replace(":", " · Week "), key)));
    if (selected) $("weeks").value = selected;
    render();
  }
  function render() {
    const data = datasets[$("weeks").value];
    $("players").replaceChildren();
    $("freshness").textContent = data ? `${data.source} · ${data.timestampKind === "retrieved" ? "Retrieved (source update time unknown)" : "Source updated"} ${new Date(data.updatedAt).toLocaleString()}` : "No weekly snapshots imported yet.";
    if (!data) return;
    [...data.players].sort((a, b) => (W.projection(b).points ?? -Infinity) - (W.projection(a).points ?? -Infinity)).forEach((p) => {
      const projection = W.projection(p);
      const row = document.createElement("tr");
      [p.name, p.position, projection.points === null ? "—" : projection.points.toFixed(1), [projection.detail, p.note].filter(Boolean).join(" · ")].forEach((text) => { const cell = document.createElement("td"); cell.textContent = text; row.append(cell); });
      $("players").append(row);
    });
  }
  $("weeks").onchange = render;
  renderWeeks();
})();
