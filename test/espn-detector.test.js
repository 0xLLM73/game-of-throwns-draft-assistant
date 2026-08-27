import test from "node:test";
import assert from "node:assert/strict";
import "../extension/lib/engine.js";
import "../extension/lib/espn-detector.js";

const detector = globalThis.EspnDraftDetector;

test("parses ESPN countdown text into seconds", () => {
  assert.equal(detector.parseClockSeconds("00:08"), 8);
  assert.equal(detector.parseClockSeconds("01:00"), 60);
  assert.equal(detector.parseClockSeconds(" 2:05 "), 125);
});

test("rejects malformed ESPN countdown text", () => {
  assert.equal(detector.parseClockSeconds("8"), null);
  assert.equal(detector.parseClockSeconds("00:60"), null);
  assert.equal(detector.parseClockSeconds(""), null);
});

test("detects when ESPN native Autopick blocks manual drafting", () => {
  const documentRoot = {
    querySelector(selector) {
      return selector === ".pickArea" ? { textContent: "You're on Autopick Disable Autopick to draft players" } : null;
    },
  };
  assert.equal(detector.isEspnAutopickEnabled(documentRoot), true);
  assert.equal(detector.isUserOnClock(documentRoot), false);
});

test("detects a paused ESPN draft", () => {
  const documentRoot = { body: { textContent: "Draft Paused by League Manager" } };
  assert.equal(detector.isDraftPaused(documentRoot), true);
});

test("reads full ESPN names and bench positions from roster rows", () => {
  const playerColumn = { getAttribute: (name) => name === "title" ? "Michael Wilson" : null };
  const playerLink = { textContent: "M. Wilson(WR)" };
  const row = {
    querySelector(selector) {
      if (selector === ".player-column") return playerColumn;
      if (selector === ".player-link-container") return playerLink;
      return null;
    },
    querySelectorAll() {
      return [{ textContent: "BE" }, { textContent: "M. Wilson(WR)" }, { textContent: "14" }];
    },
  };
  const documentRoot = { querySelectorAll: () => [row] };
  assert.deepEqual(detector.roster(documentRoot), [{ name: "Michael Wilson", position: "WR" }]);
});
