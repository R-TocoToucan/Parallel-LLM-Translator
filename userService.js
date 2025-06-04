// userService.js
document.addEventListener("DOMContentLoaded", () => {
  const waitForFirebase = () => {
    if (window.firebase && firebase.firestore) {
      attachUserService(); // run your user service setup
    } else {
      setTimeout(waitForFirebase, 50);
    }
  };
  waitForFirebase();
});

function attachUserService() {
  const auth = firebase.auth();
  const db = firebase.firestore();

  async function ensureUserProfile(user) {
    const ref = db.collection("users").doc(user.uid);
    const snap = await ref.get();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    if (!snap.exists) {
      await ref.set({
        email: user.email,
        displayName: user.displayName || "",
        tier: "free",
        createdAt: now,
        lastLogin: now,
        preferences: {
          sourceLang: "Auto Detect",
          targetLang: "Korean",
          displayMode: "replace",
          darkMode: true,
        },
        usage: {
          translations: 0,
          explanations: 0,
          enhancements: 0,
        },
      });
    } else {
      await ref.update({ lastLogin: now });
    }

    return ref;
  }

  async function bumpUsage(uid, type) {
    const ref = db.collection("users").doc(uid);
    const field = `usage.${type}`;
    const increment = firebase.firestore.FieldValue.increment(1);
    await ref.update({ [field]: increment });
  }

  function initUserService(onReady) {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userRef = await ensureUserProfile(user);
          onReady(user, userRef);
        } catch (err) {
          console.error("Error ensuring user profile:", err);
          onReady(user, null);
        }
      } else {
        onReady(null, null);
      }
    });
  }

  // Attach to global window object
  window.userService = { initUserService, bumpUsage };
}
