// ==============================
// Shortcuts (cu "sticky subscribe")
// ==============================

// Chei de storage
const STORAGE_KEY = "shortcuts";
const MIGRATION_FLAG_V2 = "shortcuts_migrated_v2";

// Limita maximă de shortcut-uri
const MAX_SHORTCUTS = 7;

// Shortcut-urile implicite (sticky până la prima editare a utilizatorului)
const defaultShortcuts = [
  { name: "YouTube", url: "https://www.youtube.com/@wallsflow?sub_confirmation=1", userEdited: false },
  { name: "Google", url: "https://www.google.com", userEdited: false },
  { name: "Pinterest", url: "https://www.pinterest.com", userEdited: false },
  { name: "Steam", url: "https://store.steampowered.com/", userEdited: false },
];

// Încarcă shortcut-urile din localStorage sau folosește cele implicite
const shortcuts = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) return [...defaultShortcuts];

    // Normalizează: dacă lipsesc câmpuri pe iteme vechi, le completăm
    return parsed.map(sc => ({
      name: sc.name,
      url: sc.url,
      userEdited: sc.userEdited ?? false,
    }));
  } catch {
    return [...defaultShortcuts];
  }
})();

// MIGRATION (o singură dată): setează subscribe pentru YouTube DOAR dacă NU e userEdited.
// Țintim iteme care par YouTube și nu trimit deja la @wallsflow.
(() => {
  if (localStorage.getItem(MIGRATION_FLAG_V2)) return;

  let changed = false;
  for (let i = 0; i < shortcuts.length; i++) {
    const sc = shortcuts[i];

    // Dacă utilizatorul a editat/atins anterior, nu atingem
    if (sc.userEdited) continue;

    const isYouTubeLike =
      typeof sc.url === "string" &&
      sc.url.includes("youtube.com");

    const alreadyWallsflow = typeof sc.url === "string" && sc.url.includes("@wallsflow");

    if (isYouTubeLike && !alreadyWallsflow) {
      shortcuts[i] = {
        ...sc,
        url: "https://www.youtube.com/@wallsflow?sub_confirmation=1",
        userEdited: false, // rămâne sticky până la prima editare
      };
      changed = true;
    }
  }

  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  localStorage.setItem(MIGRATION_FLAG_V2, "1");
})();

// ==============================
// Elementele din DOM
// ==============================
const shortcutsContainer = document.getElementById("shortcuts");
const shortcutFormContainer = document.getElementById("shortcut-form-container");
const shortcutForm = document.getElementById("shortcut-form");
const shortcutNameInput = document.getElementById("shortcut-name");
const shortcutUrlInput = document.getElementById("shortcut-url");
const closeShortcutButton = document.getElementById("close-shortcut"); // Butonul "X"
const deleteShortcutButton = document.getElementById("delete-shortcut"); // Butonul de ștergere
const formTitle = document.getElementById("form-title");
const addShortcutButton = document.getElementById("add-shortcut");

let editingIndex = null; // Shortcut-ul curent care este editat

// ==============================
// Utilitare
// ==============================

// Funcție pentru validarea URL-ului (necesită schema)
function isValidUrl(inputUrl) {
  try {
    if (/^https?:\/\//i.test(inputUrl)) {
      new URL(inputUrl);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Salvează shortcut-urile în localStorage
function saveShortcuts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

// Obține favicon-ul folosind Google API
// ==============================
// Favicon Caching System (improved performance)
// ==============================
const FAVICON_CACHE_KEY = "favicon_cache_v1";
const FAVICON_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Initialize favicon cache from localStorage
function getFaviconCache() {
  try {
    const cached = localStorage.getItem(FAVICON_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

// Save favicon cache to localStorage
function saveFaviconCache(cache) {
  try {
    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Could not save favicon cache:", e);
  }
}

// Get favicon with caching
function getFavicon(url) {
  try {
    const domain = new URL(url).origin;
    const cache = getFaviconCache();
    const cacheEntry = cache[domain];
    const now = Date.now();

    // Check if favicon is cached and still valid
    if (cacheEntry && (now - cacheEntry.timestamp) < FAVICON_CACHE_DURATION) {
      return cacheEntry.url;
    }

    // Generate new favicon URL
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

    // Update cache
    cache[domain] = {
      url: faviconUrl,
      timestamp: now
    };
    saveFaviconCache(cache);

    return faviconUrl;
  } catch {
    return "https://via.placeholder.com/48?text=?";
  }
}

// ==============================
// UI Shortcuts
// ==============================

// Afișează shortcut-urile
function renderShortcuts() {
  if (!shortcutsContainer) return;

  const addShortcutElement = document.getElementById("add-shortcut");
  shortcutsContainer.innerHTML = ""; // Golim containerul
  if (addShortcutElement) {
    shortcutsContainer.appendChild(addShortcutElement); // Shortcut-ul „+” rămâne primul
  }

  shortcuts.forEach((shortcut, index) => {
    // Changed from <a> to <div> to prevent link preview showing
    const shortcutElement = document.createElement("div");
    shortcutElement.className = "shortcut";
    shortcutElement.style.cursor = "pointer";
    shortcutElement.role = "button";
    
    // Store URL as data attribute instead of href
    shortcutElement.dataset.url = shortcut.url;

    const shortcutIcon = document.createElement("img");
    shortcutIcon.src = getFavicon(shortcut.url);
    shortcutIcon.alt = shortcut.name;

    const shortcutName = document.createElement("span");
    shortcutName.textContent = shortcut.name;

    const menuButton = document.createElement("button");
    menuButton.className = "menu-button";
    menuButton.setAttribute("aria-label", "Edit shortcut");
    menuButton.textContent = "⋮";

    menuButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation(); // Prevent shortcut from being clicked
      editingIndex = index;
      shortcutNameInput.value = shortcut.name;
      shortcutUrlInput.value = shortcut.url;
      formTitle.textContent = "Edit Shortcut";
      shortcutFormContainer.classList.add("visible");
      deleteShortcutButton.style.display = "inline-block";
    });

    // Add click handler to open URL (no link preview shown)
    shortcutElement.addEventListener("click", (event) => {
      // Make sure menu button click doesn't trigger this
      if (event.target === menuButton || menuButton.contains(event.target)) {
        return;
      }
      // Open URL without showing link preview
      window.open(shortcut.url, "_blank");
    });

    shortcutElement.appendChild(shortcutIcon);
    shortcutElement.appendChild(shortcutName);
    shortcutElement.appendChild(menuButton);

    shortcutsContainer.appendChild(shortcutElement);
  });

  // Ascunde butonul „Add Shortcut” dacă s-a atins limita
  if (addShortcutButton) {
    if (shortcuts.length >= MAX_SHORTCUTS) {
      addShortcutButton.style.display = "none";
    } else {
      addShortcutButton.style.display = "flex";
    }
  }
}

// Deschide formularul pentru shortcut nou
if (addShortcutButton) {
  addShortcutButton.addEventListener("click", () => {
    editingIndex = null;
    shortcutNameInput.value = "";
    shortcutUrlInput.value = "";
    formTitle.textContent = "Add Shortcut";
    shortcutFormContainer.classList.add("visible");
    deleteShortcutButton.style.display = "none";
  });
}

// Adaugă sau editează un shortcut
if (shortcutForm) {
  shortcutForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = shortcutNameInput.value.trim();
    const url = shortcutUrlInput.value.trim();

    if (!isValidUrl(url)) {
      shortcutUrlInput.classList.add("error");
      shortcutUrlInput.setAttribute(
        "placeholder",
        "Invalid URL! Make sure it starts with https://"
      );
      shortcutUrlInput.value = "";
      return;
    }

    shortcutUrlInput.classList.remove("error");

    if (editingIndex !== null) {
      // Orice intervenție a utilizatorului „dezlipește” linkul de subscribe
      shortcuts[editingIndex] = { ...shortcuts[editingIndex], name, url, userEdited: true };
    } else {
      // Shortcut nou creat de user => nu e sticky
      shortcuts.push({ name, url, userEdited: true });
    }

    saveShortcuts();
    renderShortcuts();
    shortcutFormContainer.classList.remove("visible");
  });
}

// Șterge shortcut-ul curent (ștergerea e tot o acțiune de utilizator)
if (deleteShortcutButton) {
  deleteShortcutButton.addEventListener("click", () => {
    if (editingIndex !== null) {
      shortcuts.splice(editingIndex, 1);
      saveShortcuts();
      renderShortcuts();
      shortcutFormContainer.classList.remove("visible");
      editingIndex = null;
    }
  });
}

// Închide formularul fără a salva
if (closeShortcutButton) {
  closeShortcutButton.addEventListener("click", () => {
    shortcutFormContainer.classList.remove("visible");
    shortcutForm.reset();
    editingIndex = null;
  });
}

// Închide formularul când se dă click în afara lui (click-outside)
if (shortcutFormContainer) {
  shortcutFormContainer.addEventListener("click", (event) => {
    const formWrapper = document.getElementById("shortcut-form-wrapper");
    // Dacă click-ul e pe container (nu pe form wrapper), închide formularul
    if (event.target === shortcutFormContainer) {
      shortcutFormContainer.classList.remove("visible");
      shortcutForm.reset();
      editingIndex = null;
    }
  });
}

// Initializează shortcut-urile la încărcare
// (Dacă scriptul e încărcat la finalul <body>, DOM-ul e deja pregătit)
renderShortcuts();

// ==============================
// PUSH (notificări în UI)
// ==============================

// Keep track of the current push timeout to clear it when a new notification comes in
let pushTimeout = null;

function showPush(message, link = null, type = "default") {
  const push = document.getElementById("push-container");
  if (!push) return;

  const messageSpan = push.querySelector(".push-message");
  const closeBtn = push.querySelector(".push-close");
  
  // Safety check: if elements don't exist, return early
  if (!messageSpan || !closeBtn) return;

  // Clear any existing timeout from previous notification
  if (pushTimeout) {
    clearTimeout(pushTimeout);
    pushTimeout = null;
  }

  // Set text content
  messageSpan.innerHTML = link
    ? `<a href="${link}" target="_blank" style="color: inherit; text-decoration: none;">${message}</a>`
    : message;

  // Set up close button
  closeBtn.onclick = () => {
    push.classList.remove("show");
    push.classList.add("hide");
    if (pushTimeout) {
      clearTimeout(pushTimeout);
      pushTimeout = null;
    }
  };

  // Show notification with proper class management
  push.classList.remove("hide");
  push.classList.add("show");
  
  // Remove all previous type classes and add the new one
  push.classList.remove("push-success", "push-warning");
  if (type === "success") {
    push.classList.add("push-success");
  } else if (type === "warning") {
    push.classList.add("push-warning");
  }

  // Auto-hide after 3 seconds (or longer for warnings - 4 seconds)
  const duration = type === "warning" ? 4000 : 3000;
  pushTimeout = setTimeout(() => {
    push.classList.remove("show");
    push.classList.add("hide");
    pushTimeout = null;
  }, duration);
}
