var browser = browser || chrome;

async function doit(e) {
  // Scripts which should be loaded first.
  await browser.tabs.executeScript({
    file: "dist/main.js",
  });
}

browser.browserAction.onClicked.addListener(doit);
