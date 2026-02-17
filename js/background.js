chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === "install") {
    chrome.storage.local.set({ installed: true }, function() {
      chrome.tabs.create({ url: "" });
    });
  }
});

if (chrome.runtime.setUninstallURL) {
  chrome.runtime.setUninstallURL('');
}
