const STORAGE_KEY = "moonlit-river-wishes-v1";
const LEGACY_PHOTO_DATABASE = "moonlit-river-gallery";
const I18N = {
  en: {
    grudgeWish: "A wish to let go, gently.",
    floatDone: "Your krathong has joined the river.",
    storageError: "This browser could not save your wish. You can still enjoy the river scene.",
    backendConnectionError: "The shared River service could not be reached. Please try again later.",
    backendUnconfigured: "The shared River database is not configured yet.",
    tooManyWrites: "Too many wishes were added at once. Please wait and try again.",
    invalidWish: "Your wish must be between 1 and 500 characters.",
    invalidDesign: "Please choose a valid krathong design.",
    wishLimitReached: "The shared River has reached its saved-wish limit.",
    syncRestored: "The shared River is connected again.",
    noWishes: "There are no wishes to export yet.",
    exportTitle: "Loy Krathong wishes",
    confirmReset: "Reset this device's saved wishes and preferences? This cannot be undone.",
    resetDone: "Saved wishes and preferences have been reset on this device.",
    resetError: "Some saved data could not be cleared. Please check this browser's storage settings.",
    emptyRiver: "The river is waiting for its first light.",
    floatFirst: "Float the first krathong",
    wishCount: (count) => `${count} krathong${count === 1 ? "" : "s"} afloat`,
    makeRipple: "Make a ripple",
    tapWish: "Tap to reveal this wish",
    audioUnavailable: "Add assets/audio/loy-krathong.mp3 to enjoy background music."
  },
  th: {
    grudgeWish: "คำอธิษฐานเพื่อค่อย ๆ ปล่อยวาง",
    floatDone: "กระทงของคุณลอยสู่สายน้ำแล้ว",
    storageError: "เบราว์เซอร์นี้บันทึกคำอธิษฐานไม่ได้ แต่คุณยังชมฉากลอยกระทงได้",
    backendConnectionError: "เชื่อมต่อสายน้ำส่วนกลางไม่ได้ โปรดลองอีกครั้งภายหลัง",
    backendUnconfigured: "ยังไม่ได้ตั้งค่าฐานข้อมูลสายน้ำส่วนกลาง",
    tooManyWrites: "มีการเพิ่มคำอธิษฐานถี่เกินไป โปรดรอสักครู่แล้วลองใหม่",
    invalidWish: "คำอธิษฐานต้องมีความยาว 1–500 ตัวอักษร",
    invalidDesign: "โปรดเลือกแบบกระทงที่ถูกต้อง",
    wishLimitReached: "สายน้ำส่วนกลางบันทึกคำอธิษฐานครบจำนวนสูงสุดแล้ว",
    syncRestored: "เชื่อมต่อสายน้ำส่วนกลางแล้ว",
    noWishes: "ยังไม่มีคำอธิษฐานให้ดาวน์โหลด",
    exportTitle: "คำอธิษฐานวันลอยกระทง",
    confirmReset: "รีเซ็ตคำอธิษฐานและการตั้งค่าที่บันทึกไว้ในอุปกรณ์นี้หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้",
    resetDone: "รีเซ็ตคำอธิษฐานและการตั้งค่าในอุปกรณ์นี้แล้ว",
    resetError: "ลบข้อมูลบางส่วนไม่ได้ โปรดตรวจสอบการตั้งค่าพื้นที่จัดเก็บของเบราว์เซอร์",
    emptyRiver: "สายน้ำกำลังรอแสงแรกจากกระทงของคุณ",
    floatFirst: "ลอยกระทงใบแรก",
    wishCount: (count) => `มีกระทงลอยอยู่ ${count} ใบ`,
    makeRipple: "สร้างระลอกคลื่น",
    tapWish: "แตะเพื่ออ่านคำอธิษฐาน",
    audioUnavailable: "เพิ่มไฟล์ assets/audio/loy-krathong.mp3 เพื่อฟังเพลงประกอบ"
  }
};

const language = "th";
let wishes = [];
let backendEnabled = false;
let backendSyncFailed = false;
let toastTimer;
let audioContext;
let effectsMuted = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const tr = (key) => I18N[language][key];
const API_ERROR_KEYS = {
  backend_unconfigured: "backendUnconfigured",
  too_many_writes: "tooManyWrites",
  invalid_wish: "invalidWish",
  invalid_design: "invalidDesign",
  wish_limit_reached: "wishLimitReached"
};

class ApiRequestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  const options = { method, headers, credentials: "same-origin" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiRequestError("server_error");
  }
  if (!response.ok) throw new ApiRequestError(result.error || "server_error");
  return result;
}

function showApiError(error) {
  const key = error instanceof ApiRequestError ? API_ERROR_KEYS[error.code] : null;
  showToast(key ? tr(key) : tr("backendConnectionError"));
}

function updateBackendView() {
  $("#shared-note").hidden = !backendEnabled;
  $("#reset-button").hidden = backendEnabled;
  $("#settings-scope").textContent = backendEnabled
    ? (language === "en" ? "Shared River" : "สายน้ำที่ใช้ร่วมกัน")
    : (language === "en" ? "Just for this device" : "สำหรับอุปกรณ์นี้เท่านั้น");
}

function readWishes() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.wish === "string") : [];
  } catch {
    showToast(tr("storageError"));
    return [];
  }
}

function saveWishes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wishes));
    return true;
  } catch {
    return false;
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3900);
}

function applyLanguage() {
  document.documentElement.lang = language;
  $$("[data-en][data-th]").forEach((el) => { el.textContent = el.dataset[language]; });
  $$("option[data-en][data-th]").forEach((el) => { el.textContent = el.dataset[language]; });
  $("#wish-name").placeholder = "เช่น นานา";
  $("#wish-text").placeholder = "ขอให้เราได้กลับมาอยู่พร้อมหน้ากันเสมอ…";
  updateBackendView();
  renderRiver();
}

function createStars() {
  const stars = $(".stars");
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 75; i++) {
    const star = document.createElement("i");
    star.className = "star";
    star.style.left = `${(i * 43.7 + 7) % 100}%`;
    star.style.top = `${(i * 29.3 + 3) % 75}%`;
    star.style.setProperty("--duration", `${2 + (i % 5)}s`);
    star.style.setProperty("--delay", `${-(i % 7)}s`);
    const size = i % 9 === 0 ? 3 : 2;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    fragment.append(star);
  }
  stars.append(fragment);
}

function currentDesign() {
  const form = $("#maker-form");
  return {
    base: form.elements.base.value,
    flower: form.elements.flower.value,
    color: form.elements.color.value,
    candle: form.elements.candle.value,
    incense: form.elements.incense.checked
  };
}

function updatePreview() {
  const design = currentDesign();
  const preview = $("#krathong-preview");
  preview.className = `krathong-preview base-${design.base} flower-${design.flower}${design.incense ? "" : " no-incense"}`;
  const baseColors = { gold: "#d3a15e", pink: "#ce8c9f", green: "#829774", orange: "#dc8b55" };
  $("#preview-base").style.background = design.base === "bread" ? "linear-gradient(180deg,#dfc28a,#b99565 80%,#80644c)" : design.base === "leaf" ? "linear-gradient(180deg,#91a477,#5c755f 80%,#3b544b)" : `linear-gradient(180deg,${baseColors[design.color]},#a96a4d 76%,#684646)`;
  $("#preview-flower").textContent = { lotus: "🪷", marigold: "🌼", orchid: "🌸" }[design.flower];
  $("#preview-flower").style.filter = "none";
  $("#preview-flame").className = `candle-flame${design.candle === "taper" ? "" : ` candle-${design.candle}`}`;
}

function surpriseMe() {
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const form = $("#maker-form");
  for (const [group, options] of Object.entries({ base: ["banana", "bread", "leaf"], flower: ["lotus", "marigold", "orchid"], color: ["gold", "pink", "green", "orange"] })) {
    form.querySelector(`[name="${group}"][value="${pick(options)}"]`).checked = true;
  }
  form.elements.candle.value = pick(["taper", "lotus", "glow"]);
  form.elements.incense.checked = Math.random() > 0.3;
  updatePreview();
}

function playSoftSound() {
  if (effectsMuted) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext ??= new AudioCtx();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.65);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.8);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.82);
  } catch { /* Audio is decorative; it must never block the celebration. */ }
}

async function floatKrathong(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const wishText = String(data.get("wish") || "").trim();
  if (!wishText) {
    $("#wish-text").focus();
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const wish = {
    id,
    name: String(data.get("name") || "").trim() || (language === "en" ? "A friend" : "ผู้ร่วมงาน"),
    wish: $("#grudge-mode").checked ? tr("grudgeWish") : wishText,
    sharedText: wishText,
    grudge: $("#grudge-mode").checked,
    design: currentDesign(),
    date: new Date().toISOString()
  };
  let saved = true;
  if (backendEnabled) {
    try {
      const result = await apiRequest("/api/wishes", { method: "POST", body: wish });
      wishes.unshift(result.wish);
    } catch (error) {
      showApiError(error);
      return;
    }
  } else {
    wishes.unshift(wish);
    saved = saveWishes();
  }
  renderRiver();
  $("#float-scene").hidden = false;
  $("#floating-wish").textContent = `“${wish.wish}”`;
  $("#floating-name").textContent = `— ${wish.name}`;
  $("#floating-flower").textContent = { lotus: "🪷", marigold: "🌼", orchid: "🌸" }[wish.design.flower];
  $("#river").scrollIntoView({ behavior: document.body.classList.contains("reduce-motion") ? "auto" : "smooth", block: "start" });
  playSoftSound();
  showToast(saved ? tr("floatDone") : tr("storageError"));
  $("#wish-text").value = "";
  $("#grudge-mode").checked = false;
  $("#grudge-message").hidden = true;
}

function renderRiver() {
  const river = $("#river-surface");
  river.replaceChildren();
  $("#empty-river").hidden = wishes.length > 0;
  $("#river-count").textContent = tr("wishCount")(wishes.length);
  const fragment = document.createDocumentFragment();
  wishes.forEach((wish, index) => {
    const boat = document.createElement("button");
    boat.type = "button";
    boat.className = "river-krathong";
    boat.style.setProperty("--raft-color", ({ gold: "#d4a15f", pink: "#ce8c9f", green: "#829774", orange: "#dc8b55" })[wish.design?.color] || "#d4a15f");
    const drift = 10 + (index % 5) * 4;
    boat.style.setProperty("--drift", `${index % 2 ? drift : -drift}px`);
    boat.style.setProperty("--float-duration", `${3.4 + (index % 4) * 0.7}s`);
    boat.style.animationDelay = `${-(index % 6) * 0.55}s`;
    boat.setAttribute("aria-expanded", "false");
    boat.setAttribute("aria-label", `${wish.name}. ${tr("tapWish")}`);

    const flower = document.createElement("span");
    flower.className = "river-flower";
    flower.setAttribute("aria-hidden", "true");
    flower.textContent = { lotus: "🪷", marigold: "🌼", orchid: "🌸" }[wish.design?.flower] || "🪷";
    const light = document.createElement("span");
    light.className = "river-light";
    light.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "river-person";
    name.textContent = wish.name;
    const message = document.createElement("span");
    message.className = "river-wish";
    message.textContent = wish.wish;
    boat.append(flower, light, name, message);
    boat.addEventListener("click", () => {
      boat.setAttribute("aria-expanded", boat.getAttribute("aria-expanded") !== "true" ? "true" : "false");
      playSoftSound();
    });
    fragment.append(boat);
  });
  river.append(fragment);
}

function makeRiverRipple() {
  const scene = $("#river-scene");
  const x = 10 + Math.random() * 80;
  const y = 18 + Math.random() * 64;
  for (let i = 0; i < 3; i++) {
    const ripple = document.createElement("span");
    ripple.className = "river-ripple";
    ripple.style.left = `${x}%`;
    ripple.style.top = `${y}%`;
    ripple.style.animationDelay = `${i * 0.28}s`;
    scene.append(ripple);
    setTimeout(() => ripple.remove(), 2200 + i * 280);
  }
  playSoftSound();
}

function releaseLantern() {
  const sky = $("#lantern-sky");
  const lantern = document.createElement("div");
  lantern.className = "lantern";
  lantern.setAttribute("aria-hidden", "true");
  lantern.style.left = `${15 + Math.random() * 70}%`;
  lantern.style.setProperty("--drift", `${Math.round(Math.random() * 130 - 65)}px`);
  lantern.style.setProperty("--rise-time", `${8 + Math.random() * 3}s`);
  const icon = document.createElement("span");
  lantern.append(icon);
  sky.append(lantern);
  playSoftSound();
  setTimeout(() => lantern.remove(), 11500);
}

function releaseFireworks() {
  const sky = $("#firework-sky");
  const colors = ["#ffd16a", "#f38cb8", "#a9dfad", "#ff9c6e", "#c5b4ff"];
  const burstCount = document.body.classList.contains("reduce-motion") ? 1 : 3;
  for (let burstIndex = 0; burstIndex < burstCount; burstIndex++) {
    setTimeout(() => {
      const burst = document.createElement("div");
      burst.className = "firework-burst";
      burst.style.left = `${15 + Math.random() * 70}%`;
      burst.style.top = `${12 + Math.random() * 55}%`;
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let sparkIndex = 0; sparkIndex < 16; sparkIndex++) {
        const spark = document.createElement("span");
        const angle = (Math.PI * 2 * sparkIndex) / 16;
        const distance = 30 + Math.random() * 24;
        spark.className = "firework-spark";
        spark.style.setProperty("--spark-color", color);
        spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
        spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance}px`);
        burst.append(spark);
      }
      sky.append(burst);
      setTimeout(() => burst.remove(), 1400);
    }, burstIndex * 220);
  }
  playSoftSound();
}

function exportWishes() {
  if (!wishes.length) {
    showToast(tr("noWishes"));
    return;
  }
  const lines = [tr("exportTitle"), "", ...wishes.map((item) => {
    const date = new Date(item.date).toLocaleString(language === "en" ? "en" : "th");
    return `${item.name} — ${date}\n${item.wish}`;
  })];
  const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "loy-krathong-wishes.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function resetSavedData() {
  if (backendEnabled) return;
  if (!window.confirm(tr("confirmReset"))) return;
  wishes = [];
  let failed = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("moonlit-river-language");
    localStorage.removeItem("moonlit-river-reduce-motion");
  } catch { failed = true; }
  renderRiver();
  $("#motion-toggle").checked = false;
  document.body.classList.remove("reduce-motion");
  if (failed) showToast(tr("resetError"));
  else showToast(tr("resetDone"));
}

function removeLegacyPhotos() {
  if (!("indexedDB" in window)) return;
  try {
    const request = indexedDB.deleteDatabase(LEGACY_PHOTO_DATABASE);
    request.onerror = () => console.error("Could not remove previously saved gallery photos.", request.error);
    request.onblocked = () => console.warn("Could not remove previously saved gallery photos while another tab is using them.");
  } catch (error) {
    console.error("Could not remove previously saved gallery photos.", error);
  }
}

function setMotionPreference(enabled) {
  document.body.classList.toggle("reduce-motion", enabled);
  try { localStorage.setItem("moonlit-river-reduce-motion", String(enabled)); } catch { /* The system preference remains available. */ }
}

function setupEvents() {
  $("#maker-form").addEventListener("change", updatePreview);
  $("#surprise-button").addEventListener("click", surpriseMe);
  $("#wish-form").addEventListener("submit", floatKrathong);
  $("#ripple-button").addEventListener("click", makeRiverRipple);
  $("#grudge-mode").addEventListener("change", (event) => { $("#grudge-message").hidden = !event.currentTarget.checked; });
  $("#float-again").addEventListener("click", () => $("#maker").scrollIntoView({ behavior: "smooth" }));
  $("#lantern-button").addEventListener("click", releaseLantern);
  $("#firework-button").addEventListener("click", releaseFireworks);
  $("#export-button").addEventListener("click", exportWishes);
  $("#reset-button").addEventListener("click", resetSavedData);
  $("#motion-toggle").addEventListener("change", (event) => setMotionPreference(event.currentTarget.checked));
  $("#effects-toggle").addEventListener("click", (event) => {
    effectsMuted = !effectsMuted;
    event.currentTarget.setAttribute("aria-pressed", String(effectsMuted));
    const label = $(".tool-label", event.currentTarget);
    label.textContent = effectsMuted ? (language === "en" ? "Muted" : "ปิดเสียง") : (language === "en" ? "Sound on" : "เปิดเสียง");
    event.currentTarget.setAttribute("aria-label", effectsMuted ? (language === "en" ? "Turn sound effects on" : "เปิดเสียงเอฟเฟกต์") : (language === "en" ? "Mute sound effects" : "ปิดเสียงเอฟเฟกต์"));
    if (!effectsMuted) playSoftSound();
  });
  $("#music-toggle").addEventListener("click", async (event) => {
    const audio = $("#background-music");
    if (audio.paused) {
      try {
        await audio.play();
        event.currentTarget.setAttribute("aria-pressed", "true");
        $(".tool-label", event.currentTarget).textContent = language === "en" ? "Music on" : "เปิดเพลง";
        event.currentTarget.setAttribute("aria-label", language === "en" ? "Pause background music" : "หยุดเพลงประกอบ");
      } catch {
        showToast(tr("audioUnavailable"));
      }
    } else {
      audio.pause();
      event.currentTarget.setAttribute("aria-pressed", "false");
      $(".tool-label", event.currentTarget).textContent = language === "en" ? "Music" : "ดนตรี";
      event.currentTarget.setAttribute("aria-label", language === "en" ? "Play background music" : "เล่นเพลงประกอบ");
    }
  });
}

async function refreshSharedWishes(notifyFailure) {
  try {
    const data = await apiRequest("/api/wishes");
    if (JSON.stringify(data.wishes) !== JSON.stringify(wishes)) {
      wishes = data.wishes;
      renderRiver();
    }
    if (backendSyncFailed) showToast(tr("syncRestored"));
    backendSyncFailed = false;
  } catch (error) {
    if (notifyFailure || !backendSyncFailed) showApiError(error);
    backendSyncFailed = true;
  }
}

async function initialize() {
  removeLegacyPhotos();
  createStars();
  setupEvents();
  updatePreview();
  renderRiver();
  applyLanguage();
  let reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
  try { reduceMotion = localStorage.getItem("moonlit-river-reduce-motion") === "true" || reduceMotion; } catch { /* Use the operating-system preference. */ }
  $("#motion-toggle").checked = reduceMotion;
  setMotionPreference(reduceMotion);

  if (location.protocol === "file:") {
    wishes = readWishes();
    renderRiver();
    return;
  }

  try {
    const status = await apiRequest("/api/status");
    backendEnabled = status.enabled === true;
  } catch (error) {
    backendEnabled = true;
    updateBackendView();
    renderRiver();
    showApiError(error);
    return;
  }

  if (!backendEnabled) {
    wishes = readWishes();
    renderRiver();
    return;
  }

  updateBackendView();
  await refreshSharedWishes(true);
  window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshSharedWishes(false);
  }, 10000);
}

initialize();
