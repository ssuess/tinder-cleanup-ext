const checkbox = document.getElementById("demoMode") as HTMLInputElement;

// Load current state
chrome.storage.local.get("demoMode", (result) => {
  checkbox.checked = result.demoMode ?? false;
});

// Save and broadcast on change
checkbox.addEventListener("change", async () => {
  const enabled = checkbox.checked;
  await chrome.storage.local.set({ demoMode: enabled });

  // Notify content script on all Tinder tabs
  const tabs = await chrome.tabs.query({ url: "https://tinder.com/*" });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "DEMO_MODE",
        payload: { enabled },
      });
    }
  }
});
