(async function options() {
  const defaults = globalThis.DraftAssistantEngine.DEFAULT_CONFIG;
  const stored = await chrome.storage.local.get("draftAssistantConfig");
  const storedConfig = stored.draftAssistantConfig || {};
  const config = {
    ...defaults,
    ...storedConfig,
    rosterMax: { ...defaults.rosterMax },
  };
  if ((Number(storedConfig.autoDraftWindowVersion) || 0) < defaults.autoDraftWindowVersion) {
    config.autoDraftMinSeconds = 10;
    config.autoDraftMaxSeconds = 20;
    config.autoDraftWindowVersion = defaults.autoDraftWindowVersion;
    await chrome.storage.local.set({ draftAssistantConfig: config });
  }
  if ((Number(storedConfig.rankingModelVersion) || 0) < defaults.rankingModelVersion) {
    config.rankingModel = "vegas-only";
    config.rankingModelVersion = defaults.rankingModelVersion;
    await chrome.storage.local.set({ draftAssistantConfig: config });
  }
  const form = document.querySelector("form");
  form.elements.rankingModel.value = config.rankingModel;
  form.elements.draftSlot.value = config.draftSlot || "";
  form.elements.autoDraftMinSeconds.value = config.autoDraftMinSeconds || config.autoDraftSeconds || 10;
  form.elements.autoDraftMaxSeconds.value = config.autoDraftMaxSeconds || 20;
  form.elements.autoDraftEnabled.checked = Boolean(config.autoDraftEnabled);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = {
      ...config,
      rankingModel: ["think-rmv", "sharp-value", "vegas-sharks-80", "vegas-only", "balanced-v04"].includes(form.elements.rankingModel.value)
        ? form.elements.rankingModel.value
        : "vegas-only",
      draftSlot: Number(form.elements.draftSlot.value) || 0,
      autoDraftEnabled: form.elements.autoDraftEnabled.checked,
      autoDraftMinSeconds: Math.min(55, Math.max(5, Number(form.elements.autoDraftMinSeconds.value) || 10)),
      autoDraftMaxSeconds: Math.min(55, Math.max(Number(form.elements.autoDraftMinSeconds.value) || 10, Number(form.elements.autoDraftMaxSeconds.value) || 20)),
    };
    await chrome.storage.local.set({ draftAssistantConfig: next });
    form.querySelector("output").textContent = "Saved locally.";
  });
})();
