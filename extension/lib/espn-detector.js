(function attachEspnDetector(root) {
  "use strict";

  const engine = root.DraftAssistantEngine;

  function text(element) {
    return element?.textContent?.trim() || "";
  }

  function uniqueNames(elements) {
    const names = [];
    const seen = new Set();
    for (const element of elements) {
      const name = text(element);
      const key = engine.normalizeName(name);
      if (!key || key === "empty" || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }

  function currentPick(documentRoot = document) {
    const scope = documentRoot.querySelector(".current-pick-module-container") || documentRoot.body;
    const match = text(scope).match(/On the Clock:\s*Pick\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function draftedNames(documentRoot = document) {
    const selectors = [
      ".pick-message__container .playerinfo__playername",
      ".pick-history .playerinfo__playername",
      ".draft-board-grid-pick-cell.completedPick .playerFirstName",
    ];
    const direct = uniqueNames(documentRoot.querySelectorAll(selectors.slice(0, 2).join(",")));
    const boardNames = [...documentRoot.querySelectorAll(".draft-board-grid-pick-cell.completedPick")]
      .map((cell) => `${text(cell.querySelector(".playerFirstName"))} ${text(cell.querySelector(".playerLastName"))}`.trim())
      .filter(Boolean);
    return uniqueNames([...direct.map((name) => ({ textContent: name })), ...boardNames.map((name) => ({ textContent: name }))]);
  }

  function roster(documentRoot = document) {
    return [...documentRoot.querySelectorAll(".roster-module tbody tr, .roster-module [role='row']")]
      .map((row) => {
        const playerColumn = row.querySelector(".player-column");
        const name = playerColumn?.getAttribute("title") || text(row.querySelector(".playerinfo__playername, .player-link-container a, .player-link-container"));
        const cells = [...row.querySelectorAll("td, [role='cell'], [role='gridcell']")].map(text);
        const benchPosition = text(row.querySelector(".player-link-container")).match(/\((QB|RB|WR|TE|D\/ST|DST|K)\)\s*$/)?.[1];
        const position = benchPosition || cells[0];
        return name && name !== "Empty" && position ? { name, position } : null;
      })
      .filter(Boolean);
  }

  function visibleAvailableNames(documentRoot = document) {
    return uniqueNames(documentRoot.querySelectorAll(".draft-players .players-table .playerinfo__playername"));
  }

  function isUserOnClock(documentRoot = document) {
    const pickArea = documentRoot.querySelector(".pickArea");
    return /You are on the clock!/i.test(text(pickArea));
  }

  function isEspnAutopickEnabled(documentRoot = document) {
    const pickArea = documentRoot.querySelector(".pickArea");
    return /You(?:'|’| a)re on Autopick|Disable Autopick to draft players/i.test(text(pickArea));
  }

  function isDraftPaused(documentRoot = document) {
    return /Draft (?:is )?Paused|Resume Draft/i.test(text(documentRoot.body));
  }

  function parseClockSeconds(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    return seconds < 60 ? minutes * 60 + seconds : null;
  }

  function clockSeconds(documentRoot = document) {
    return parseClockSeconds(text(documentRoot.querySelector(".clock__content, .clock__digits")));
  }

  function inferDraftSlot(documentRoot = document, teams = 10) {
    const firstPickMessage = text(documentRoot.body).match(/Your first pick:\s*Round\s*1,\s*Pick\s*(\d+)/i);
    if (firstPickMessage) return Math.min(teams, Number(firstPickMessage[1]));
    const firstOwnPick = documentRoot.querySelector(".pick-component.own-pick .pick-number");
    const pickTrainMatch = text(firstOwnPick).match(/PICK\s*(\d+)/i);
    if (!pickTrainMatch) return 0;
    const overall = Number(pickTrainMatch[1]);
    return overall >= 1 && overall <= teams ? overall : 0;
  }

  function snapshot(documentRoot = document, teams = 10) {
    return {
      currentPick: currentPick(documentRoot),
      draftedNames: draftedNames(documentRoot),
      roster: roster(documentRoot),
      visibleAvailableNames: visibleAvailableNames(documentRoot),
      inferredDraftSlot: inferDraftSlot(documentRoot, teams),
      isUserOnClock: isUserOnClock(documentRoot),
      isEspnAutopickEnabled: isEspnAutopickEnabled(documentRoot),
      isDraftPaused: isDraftPaused(documentRoot),
      secondsRemaining: clockSeconds(documentRoot),
    };
  }

  root.EspnDraftDetector = { currentPick, draftedNames, roster, visibleAvailableNames, isUserOnClock, isEspnAutopickEnabled, isDraftPaused, parseClockSeconds, clockSeconds, inferDraftSlot, snapshot };
})(globalThis);
