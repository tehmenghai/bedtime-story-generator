// Auto-detect backend URL: use localhost for local development, and the Render URL in production
const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://bedtime-story-api-jc6z.onrender.com";

// State variables for TTS (Text-to-Speech)
let currentUtterance = null;
let isSpeaking = false;

// HTML Escaper
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

// Map mood string to appropriate emoji
function getMoodEmoji(mood) {
    const moods = {
        "Magical": "✨",
        "Dreamy": "🌙",
        "Adventure": "🐾",
        "Funny": "😄",
        "Calm": "🌊"
    };
    return moods[mood] || "📖";
}

// ────────────────────────────────────────────────────────────────
// Stories Drawer State
// ────────────────────────────────────────────────────────────────

let drawerStories = [];    // Full list of stories from the backend
let activeStoryId = null;  // Currently displayed story ID
let drawerOpen = false;    // Whether the drawer is visible

// Compute a relative time string from a date string
function relativeTime(dateStr) {
    try {
        const d = new Date(dateStr.replace(" ", "T"));
        if (isNaN(d.getTime())) return dateStr;
        const diffMs = Date.now() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return "just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH}h ago`;
        const diffD = Math.floor(diffH / 24);
        return `${diffD}d ago`;
    } catch {
        return dateStr;
    }
}

// ────────────────────────────────────────────────────────────────
// Drawer Rendering
// ────────────────────────────────────────────────────────────────

function updateBadge() {
    const badge = document.getElementById("stories-count-badge");
    if (badge) badge.textContent = drawerStories.length;

    const subtitle = document.getElementById("drawer-subtitle");
    if (subtitle) subtitle.textContent = `${drawerStories.length} stor${drawerStories.length === 1 ? "y" : "ies"}`;
}

function renderDrawerCards(filtered) {
    const list = document.getElementById("drawer-list");
    const emptyEl = document.getElementById("drawer-empty");
    const emptyMsg = document.getElementById("drawer-empty-msg");
    const searchVal = document.getElementById("drawer-search").value.trim();

    if (filtered.length === 0) {
        list.innerHTML = "";
        emptyEl.removeAttribute("hidden");
        if (searchVal) {
            emptyMsg.textContent = `No stories match "${searchVal}"`;
        } else {
            emptyMsg.textContent = "No saved stories yet. Generate your first one!";
        }
        return;
    }

    emptyEl.setAttribute("hidden", "");
    list.innerHTML = filtered.map(story => buildCardHTML(story)).join("");

    // Wire up card click handlers
    list.querySelectorAll(".drawer-card").forEach(card => {
        card.addEventListener("click", () => {
            const sid = card.dataset.sid;
            const story = drawerStories.find(s => String(s.id) === sid);
            if (!story || card.dataset.confirming === "true") return;
            setActiveStory(story);
        });
    });

    // Wire up trash buttons
    list.querySelectorAll(".drawer-card-delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const card = btn.closest(".drawer-card");
            showDeleteConfirm(card);
        });
    });
}

function buildCardHTML(story) {
    const emoji = getMoodEmoji(story.mood);
    const isActive = String(story.id) === String(activeStoryId);
    const settingLine = story.setting
        ? `<span class="drawer-card-setting">${escapeHtml(story.setting)}</span>`
        : "";

    return `
    <li>
      <button class="drawer-card${isActive ? " active" : ""}"
              data-sid="${story.id}"
              data-confirming="false"
              type="button">
        <span class="drawer-card-avatar">${emoji}</span>
        <span class="drawer-card-body">
          <span class="drawer-card-title">${escapeHtml(story.name)}'s story</span>
          <span class="drawer-card-meta">${escapeHtml(story.mood || "Story")} · ${escapeHtml(story.time || "")}</span>
          ${settingLine}
        </span>
        <button class="drawer-card-delete" type="button" title="Delete story" aria-label="Delete story">🗑</button>
      </button>
    </li>`;
}

function showDeleteConfirm(card) {
    card.dataset.confirming = "true";
    const deleteBtn = card.querySelector(".drawer-card-delete");
    if (!deleteBtn) return;

    // Replace the trash icon with Delete / Cancel row
    deleteBtn.style.display = "none";

    const confirmEl = document.createElement("span");
    confirmEl.className = "drawer-card-confirm";
    confirmEl.innerHTML = `
        <button class="confirm-delete-btn" type="button">Delete</button>
        <button class="confirm-cancel-btn" type="button">Cancel</button>
    `;
    card.appendChild(confirmEl);

    confirmEl.querySelector(".confirm-delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        const sid = card.dataset.sid;
        deleteStory(sid);
    });

    confirmEl.querySelector(".confirm-cancel-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        // Restore trash icon
        card.dataset.confirming = "false";
        confirmEl.remove();
        deleteBtn.style.display = "";
    });
}

function deleteStory(sid) {
    drawerStories = drawerStories.filter(s => String(s.id) !== String(sid));
    if (String(activeStoryId) === String(sid)) {
        activeStoryId = null;
        showEmpty();
    }
    updateBadge();
    applySearch();
}

function applySearch() {
    const q = document.getElementById("drawer-search").value.trim().toLowerCase();
    const filtered = q
        ? drawerStories.filter(s =>
            (s.name || "").toLowerCase().includes(q) ||
            (s.mood || "").toLowerCase().includes(q) ||
            (s.setting || "").toLowerCase().includes(q)
          )
        : drawerStories;
    renderDrawerCards(filtered);
}

function setActiveStory(story) {
    activeStoryId = story.id;

    // Parse mood/length from the stored plot string (for DB stories)
    let mood = story.mood || "Magical";
    let storyBody = story.body || "";
    let length = story.length || "Long";

    renderStory(storyBody, story.name, mood, length);
    applySearch();  // Re-render cards to update active state
}

// ────────────────────────────────────────────────────────────────
// Drawer Toggle
// ────────────────────────────────────────────────────────────────

function openDrawer() {
    drawerOpen = true;
    const drawer = document.getElementById("stories-drawer");
    const container = document.querySelector(".app-container");
    const toggleBtn = document.getElementById("stories-toggle-btn");

    drawer.removeAttribute("hidden");
    container.classList.add("drawer-open");
    toggleBtn.classList.add("active");

    // Auto-focus search
    setTimeout(() => {
        const search = document.getElementById("drawer-search");
        if (search) search.focus();
    }, 80);
}

function closeDrawer() {
    drawerOpen = false;
    const drawer = document.getElementById("stories-drawer");
    const container = document.querySelector(".app-container");
    const toggleBtn = document.getElementById("stories-toggle-btn");

    drawer.setAttribute("hidden", "");
    container.classList.remove("drawer-open");
    toggleBtn.classList.remove("active");
}

document.getElementById("stories-toggle-btn").addEventListener("click", () => {
    if (drawerOpen) {
        closeDrawer();
    } else {
        openDrawer();
    }
});

// ────────────────────────────────────────────────────────────────
// Search Wiring
// ────────────────────────────────────────────────────────────────

const searchInput = document.getElementById("drawer-search");
const searchClear = document.getElementById("drawer-search-clear");

searchInput.addEventListener("input", () => {
    const hasValue = searchInput.value.length > 0;
    if (hasValue) {
        searchClear.removeAttribute("hidden");
    } else {
        searchClear.setAttribute("hidden", "");
    }
    applySearch();
});

searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.setAttribute("hidden", "");
    searchInput.focus();
    applySearch();
});

// Esc: clear search if non-empty, close drawer if search already empty
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (drawerOpen) {
            if (searchInput.value) {
                searchInput.value = "";
                searchClear.setAttribute("hidden", "");
                applySearch();
            } else {
                closeDrawer();
            }
        }
    }
});

// ────────────────────────────────────────────────────────────────
// Load Stories from Backend
// ────────────────────────────────────────────────────────────────

async function loadDrawerStories() {
    try {
        const r = await fetch(`${BACKEND_URL}/stories?child_name=`);
        if (!r.ok) return;
        const items = await r.json();

        drawerStories = items.map(it => {
            let mood = "Magical";
            let displaySetting = it.setting || "";
            const moodMatch = (it.plot || "").match(/\(Mood:\s*([A-Za-z]+)/);
            if (moodMatch) mood = moodMatch[1];

            return {
                id: it.id,
                name: it.child_name,
                mood: mood,
                time: relativeTime(it.created_at),
                setting: displaySetting,
                characters: it.characters,
                body: it.body,
            };
        });

        updateBadge();
        applySearch();
    } catch (e) {
        console.error("Failed to load stories:", e);
    }
}

// ────────────────────────────────────────────────────────────────
// UI State Controls
// ────────────────────────────────────────────────────────────────

function renderStory(text, childName, mood, length) {
    stopSpeaking(); // Stop any active speech first

    const placeholder = document.getElementById("story-placeholder");
    const container = document.getElementById("story-container");
    const out = document.getElementById("story-output");
    const speakToggle = document.getElementById("speak-toggle");
    
    const titleEl = document.getElementById("story-meta-title");
    const subtitleEl = document.getElementById("story-meta-subtitle");

    // Configure details & headers
    titleEl.textContent = `${childName}'s Bedtime Story`;
    subtitleEl.textContent = `${getMoodEmoji(mood)} ${mood} · ${length || 'Long'}`;

    placeholder.style.display = "none";
    container.style.display = "block";
    
    // Parse paragraphs and render safely
    const paragraphs = text.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p)}</p>`).join("");
    out.innerHTML = paragraphs;
    
    // Show speaker read-aloud toggle if Web Speech API is supported
    if ('speechSynthesis' in window) {
        speakToggle.style.display = "flex";
    }
}

function showLoading() {
    stopSpeaking();
    const placeholder = document.getElementById("story-placeholder");
    const container = document.getElementById("story-container");
    const speakToggle = document.getElementById("speak-toggle");

    speakToggle.style.display = "none";
    container.style.display = "none";
    placeholder.style.display = "flex";
    
    placeholder.innerHTML = `
        <div class="placeholder-loading">
            <div class="loading-pulse"></div>
            <div class="loading-pulse"></div>
            <div class="loading-pulse"></div>
            <p style="margin-top: 1.5rem; font-weight: 600; font-style: italic;">Weaving your bedtime story…</p>
        </div>
    `;
}

function showEmpty() {
    stopSpeaking();
    const placeholder = document.getElementById("story-placeholder");
    const container = document.getElementById("story-container");
    const speakToggle = document.getElementById("speak-toggle");

    speakToggle.style.display = "none";
    container.style.display = "none";
    placeholder.style.display = "flex";
    
    placeholder.innerHTML = `
        <div class="moon-box">
            <span class="placeholder-emoji">🌙</span>
        </div>
        <h1>Your story will appear here</h1>
        <p>Fill in the details on the left, then click <strong>Generate story</strong> to create a personalised bedtime story.</p>
        <div class="emoji-deco">
            <span class="deco-circle">✨</span>
            <span class="deco-circle">🌙</span>
            <span class="deco-circle">🦉</span>
            <span class="deco-circle">🦊</span>
            <span class="deco-circle">⭐</span>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// Form Interactive Chip Selectors (Mood & Length)
// ────────────────────────────────────────────────────────────────

// Mood Selection Chips
document.querySelectorAll(".mood-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
    });
});

// Length Segmented Buttons
document.querySelectorAll(".length-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".length-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

// ────────────────────────────────────────────────────────────────
// Generate Story Button Handler
// ────────────────────────────────────────────────────────────────

document.getElementById("generate-btn").addEventListener("click", async () => {
    const form = document.getElementById("story-form");
    const errEl = document.getElementById("error");
    errEl.textContent = "";
    
    const childName = form.child_name.value.trim();
    if (!childName) {
        errEl.textContent = "Please fill in at least the child's name.";
        return;
    }
    
    showLoading();

    // Read interactive elements
    const activeMoodChip = document.querySelector(".mood-chip.active");
    const mood = activeMoodChip ? activeMoodChip.dataset.mood : "Magical";
    
    const activeLengthBtn = document.querySelector(".length-btn.active");
    const length = activeLengthBtn ? activeLengthBtn.dataset.length : "Long";

    const settingVal = form.setting.value.trim() || "a cozy dreamland";
    const charactersVal = form.characters.value.trim() || "friendly creatures";

    // Compose plot with custom instructions for the LLM
    let rawPlot = form.plot.value.trim() || "going on a magical adventure and learning a sweet lesson";
    let finalPlot = `${rawPlot} (Mood: ${mood}, Length: ${length})`;

    const payload = {
        child_name: childName,
        characters: charactersVal,
        setting: settingVal,
        plot: finalPlot,
    };

    try {
        const r = await fetch(`${BACKEND_URL}/story`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Request failed");
        
        // Reload drawer from backend to get the newly saved story (with real ID)
        await loadDrawerStories();

        // Set the newest story (first in list) as active
        if (drawerStories.length > 0) {
            activeStoryId = drawerStories[0].id;
            applySearch(); // Refresh active styling
        }

        renderStory(data.story, childName, mood, length);

    } catch (e) {
        showEmpty();
        errEl.textContent = e.message;
    }
});

// ────────────────────────────────────────────────────────────────
// UI Navigation / Theme Controls
// ────────────────────────────────────────────────────────────────

// New Story Button Reset Form
document.getElementById("new-story-btn").addEventListener("click", () => {
    document.getElementById("story-form").reset();
    document.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("active"));
    document.querySelector(".mood-chip[data-mood='Magical']").classList.add("active");
    document.querySelectorAll(".length-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(".length-btn[data-length='Long']").classList.add("active");
    document.getElementById("error").textContent = "";
    activeStoryId = null;
    applySearch();  // Clear active card highlight
    showEmpty();
});

// Light/Dark Theme Switcher
const themeBtn = document.getElementById("theme-toggle");
const sunIcon = themeBtn.querySelector(".sun-icon");
const moonIcon = themeBtn.querySelector(".moon-icon");

// Load local setting if present
if (localStorage.getItem("dark-mode") === "enabled") {
    document.body.classList.add("dark-theme");
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
}

themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    if (document.body.classList.contains("dark-theme")) {
        localStorage.setItem("dark-mode", "enabled");
        sunIcon.style.display = "none";
        moonIcon.style.display = "block";
    } else {
        localStorage.setItem("dark-mode", "disabled");
        sunIcon.style.display = "block";
        moonIcon.style.display = "none";
    }
});

// ────────────────────────────────────────────────────────────────
// TTS Read Aloud Controller (Web Speech API)
// ────────────────────────────────────────────────────────────────

const speakBtn = document.getElementById("speak-toggle");
const speakIcon = speakBtn.querySelector(".speaker-icon");
const muteIcon = speakBtn.querySelector(".mute-icon");

speakBtn.addEventListener("click", () => {
    if (isSpeaking) {
        stopSpeaking();
    } else {
        startSpeaking();
    }
});

function startSpeaking() {
    const text = document.getElementById("story-output").innerText;
    if (!text) return;

    window.speechSynthesis.cancel(); // Clear queued speech

    currentUtterance = new SpeechSynthesisUtterance(text);
    
    // Choose a warm, calm, bedtime-friendly voice if available
    const voices = window.speechSynthesis.getVoices();
    const prefVoices = ["Google US English", "Microsoft Zira", "en-US", "Samantha"];
    let voice = voices.find(v => prefVoices.some(pref => v.name.includes(pref)));
    if (voice) currentUtterance.voice = voice;

    // Slow down speech slightly for a relaxed bedtime reading pace
    currentUtterance.rate = 0.85; 
    currentUtterance.pitch = 1.0;

    currentUtterance.onend = () => { stopSpeaking(); };
    currentUtterance.onerror = () => { stopSpeaking(); };

    speakIcon.style.display = "none";
    muteIcon.style.display = "block";
    isSpeaking = true;

    window.speechSynthesis.speak(currentUtterance);
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    speakIcon.style.display = "block";
    muteIcon.style.display = "none";
    isSpeaking = false;
    currentUtterance = null;
}

// ────────────────────────────────────────────────────────────────
// Initialise on Page Load
// ────────────────────────────────────────────────────────────────

loadDrawerStories();
