// userService.js

// 로컬 크레딧/티어 기본값
export const TIER_CREDIT_DEFAULTS = { free: 1000, premium: 50000 };

// 초기화: userEmail 이 storage 에 있으면 기본값 보장 후 콜백
export function initUserService(onReady) {
  chrome.storage.local.get(["userEmail"], async data => {
    if (!data.userEmail) return onReady(null, null);
    const user = { email: data.userEmail };
    await ensureUserDefaults();
    onReady(user, { email: user.email });
  });
}

// 로컬 tier/credit 기본값 설정
async function ensureUserDefaults() {
  chrome.storage.local.get(["credit","tier"], data => {
    if (data.credit == null) {
      chrome.storage.local.set({
        credit: TIER_CREDIT_DEFAULTS.free,
        tier:   "free"
      });
    }
  });
}

// 현재 credit 조회
export function getCredit() {
  return new Promise(resolve =>
    chrome.storage.local.get(["credit"], data =>
      resolve(data.credit || 0)
    )
  );
}

// credit 차감
export function decrementCredit(amount = 1) {
  chrome.storage.local.get(["credit"], data => {
    const newCredit = (data.credit || 0) - amount;
    chrome.storage.local.set({ credit: newCredit });
  });
}

// 현재 tier 조회
export function getUserTier() {
  return new Promise(resolve =>
    chrome.storage.local.get(["tier"], data =>
      resolve(data.tier || "free")
    )
  );
}

// tier 업데이트
export function updateUserTier(newTier) {
  chrome.storage.local.set({ tier: newTier });
}
