// @ts-check
// Klik op het extensie-icoon: open het overzicht in het huidige itslearning-tabblad,
// of open de laatst gebruikte itslearning-omgeving als je ergens anders zit.

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "its-overzicht-open" });
      return;
    } catch {
      // Geen content script in dit tabblad (geen itslearning-pagina).
    }
  }
  const { lastOrigin } = await chrome.storage.local.get("lastOrigin");
  const url = lastOrigin ? `${lastOrigin}/DashboardMenu.aspx#its-overzicht` : "https://itslearning.com/";
  await chrome.tabs.create({ url });
});
