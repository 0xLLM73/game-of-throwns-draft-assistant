(function (root) {
  "use strict";
  // Find a column by its header text so ESPN reordering columns doesn't break us.
  function columnIndex(row, pattern) {
    const table = row.closest("table");
    const headers = Array.from(table?.querySelectorAll("thead tr:last-child th") || []);
    return headers.findIndex(th => pattern.test(th.textContent.trim()));
  }
  function cellText(row, pattern) {
    const index = columnIndex(row, pattern);
    return index < 0 ? "" : row.querySelectorAll("td")[index]?.textContent.trim() || "";
  }
  // One ESPN player row -> identity used by the projection code. Returns null for non-player rows.
  function readRow(row) {
    const node = row.querySelector(".player__column[title], .player-column__athlete[title]");
    if (!node) return null;
    const slot = row.querySelector("td")?.textContent.trim() || "";
    const title = (node.getAttribute("title") || "").trim();
    if (!title || /^(Player|Empty)$/i.test(title)) return { name: "Empty slot", empty: true, slot };
    const link = row.querySelector('a[href*="playerId="], a[href*="/player/_/id/"]');
    const headshot = row.querySelector('.player-headshot img[src*="/players/full/"]')?.getAttribute("src") || "";
    const espnId = link?.getAttribute("href")?.match(/(?:playerId=|\/id\/)(\d+)/)?.[1] || headshot.match(/\/players\/full\/(\d+)\.png/)?.[1] || null;
    const opp = cellText(row, /^opp$/i);
    const proj = Number.parseFloat(cellText(row, /^proj$/i));
    const move = row.querySelector('button[aria-label^="Select "][aria-label$=" to move"]') || Array.from(row.querySelectorAll("button")).find(b => /^move$/i.test(b.textContent.trim()));
    return {
      name: title, espnId, slot,
      team: row.querySelector(".playerinfo__playerteam")?.textContent.trim().toUpperCase() || "",
      position: row.querySelector(".playerinfo__playerpos")?.textContent.trim().replace("D/ST", "DST") || undefined,
      status: row.querySelector(".playerinfo__injurystatus")?.textContent.trim() || "",
      opp, bye: /BYE/i.test(opp), espnProj: Number.isFinite(proj) ? proj : null,
      locked: Boolean(move?.disabled),
    };
  }
  root.WeeklyVegasDom = { readRow, columnIndex, cellText };
})(globalThis);
