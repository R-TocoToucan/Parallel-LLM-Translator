document.addEventListener("DOMContentLoaded", () => {
  const waitForChrome = () => {
    if (chrome && chrome.storage) attachUserService();
    else setTimeout(waitForChrome, 50);
  };
  waitForChrome();
});

function attachUserService() {
  const TIER_CREDIT_DEFAULTS = { free: 1000, premium: 50000 };

  function initUserService(onReady) {
    chrome.storage.local.get(["userEmail"], async data => {
      if (!data.userEmail) return onReady(null, null);
      const user = { email: data.userEmail };
      await ensureUserDefaults(user.email);
      onReady(user, { email: user.email });
    });
  }

  async function ensureUserDefaults(email) {
    chrome.storage.local.get(["credit", "tier"], data => {
      if (data.credit == null) {
        chrome.storage.local.set({
          credit: TIER_CREDIT_DEFAULTS["free"],
          tier: "free"
        });
      }
    });
  }

  async function getCredit() {
    return new Promise(resolve => {
      chrome.storage.local.get(["credit"], data => resolve(data.credit || 0));
    });
  }

  async function decrementCredit(amount = 1) {
    chrome.storage.local.get(["credit"], data => {
      const newCredit = (data.credit || 0) - amount;
      chrome.storage.local.set({ credit: newCredit });
    });
  }

  async function getUserTier() {
    return new Promise(resolve => {
      chrome.storage.local.get(["tier"], data => resolve(data.tier || "free"));
    });
  }

  async function updateUserTier(newTier) {
    chrome.storage.local.set({ tier: newTier });
  }

  window.userService = {
    initUserService,
    getCredit,
    decrementCredit,
    getUserTier,
    updateUserTier
  };
}
