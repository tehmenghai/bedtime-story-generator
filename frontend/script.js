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

// ----------------------------------------------------
// UI State Controls
// ----------------------------------------------------

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

// ----------------------------------------------------
// Form Interactive Chip Selectors (Mood & Length)
// ----------------------------------------------------

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

// ----------------------------------------------------
// Generate Story Button Handler
// ----------------------------------------------------

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

    // Compose plot with custom instructions for the LLM
    let rawPlot = form.plot.value.trim() || "going on a magical adventure and learning a sweet lesson";
    let finalPlot = `${rawPlot} (Mood: ${mood}, Length: ${length})`;

    const payload = {
        child_name: childName,
        characters: form.characters.value.trim() || "friendly creatures",
        setting: form.setting.value.trim() || "a cozy dreamland",
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
        
        renderStory(data.story, childName, mood, length);
        loadRecentStories();
    } catch (e) {
        showEmpty();
        errEl.textContent = e.message;
    }
});

// ----------------------------------------------------
// Recent Stories Loader (Postgres library Integration)
// ----------------------------------------------------

async function loadRecentStories() {
    const name = document.getElementById("child_name").value.trim();
    const aside = document.getElementById("recent-stories");
    const list = document.getElementById("recent-list");
    if (!name) { aside.hidden = true; return; }
    try {
        const r = await fetch(`${BACKEND_URL}/stories?child_name=${encodeURIComponent(name)}`);
        if (!r.ok) { aside.hidden = true; return; }
        const items = await r.json();
        if (items.length === 0) { aside.hidden = true; return; }
        
        list.innerHTML = items.map(it => {
            // Attempt to parse mood/length from database plot string
            let mood = "Magical";
            let displayPlot = it.plot;
            const moodMatch = it.plot.match(/\(Mood:\s*([A-Za-z]+)/);
            if (moodMatch) {
                mood = moodMatch[1];
                displayPlot = it.plot.replace(/\s*\(Mood:\s*[A-Za-z]+,\s*Length:\s*[A-Za-z]+\)/, "");
            }
            
            // Format nice human-readable relative time or fallback to date
            const dateStr = new Date(it.created_at).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
            });

            return `<li>
                <button type="button" class="recent-item-card" data-body="${escapeHtml(it.body)}" data-mood="${mood}">
                    <div class="recent-card-icon">${getMoodEmoji(mood)}</div>
                    <div class="recent-card-info">
                        <span class="recent-card-name">${escapeHtml(it.child_name)}'s Story</span>
                        <span class="recent-card-meta">${mood} · ${dateStr}</span>
                    </div>
                </button>
            </li>`;
        }).join("");
        
        // Wire events on card clicks
        list.querySelectorAll(".recent-item-card").forEach(btn => {
            btn.addEventListener("click", () => {
                list.querySelectorAll(".recent-item-card").forEach(c => c.classList.remove("active"));
                btn.classList.add("active");
                
                const mood = btn.dataset.mood;
                renderStory(btn.dataset.body, name, mood, "Long");
            });
        });
        aside.hidden = false;
    } catch (e) { aside.hidden = true; }
}

document.getElementById("child_name").addEventListener("blur", loadRecentStories);

// ----------------------------------------------------
// UI Navigation / Theme Controls
// ----------------------------------------------------

// New Story Button Reset Form
document.getElementById("new-story-btn").addEventListener("click", () => {
    document.getElementById("story-form").reset();
    document.querySelectorAll(".mood-chip").forEach(c => c.classList.remove("active"));
    document.querySelector(".mood-chip[data-mood='Magical']").classList.add("active");
    document.querySelectorAll(".length-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(".length-btn[data-length='Long']").classList.add("active");
    document.getElementById("error").textContent = "";
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

// ----------------------------------------------------
// TTS Read Aloud Controller (Web Speech API)
// ----------------------------------------------------

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
    // Prefer high-quality standard voices
    const prefVoices = ["Google US English", "Microsoft Zira", "en-US", "Samantha"];
    let voice = voices.find(v => prefVoices.some(pref => v.name.includes(pref)));
    if (voice) currentUtterance.voice = voice;

    // Slow down speech slightly for a relaxed bedtime reading pace
    currentUtterance.rate = 0.85; 
    currentUtterance.pitch = 1.0;

    currentUtterance.onend = () => {
        stopSpeaking();
    };

    currentUtterance.onerror = () => {
        stopSpeaking();
    };

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
