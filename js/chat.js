// Chat pe right-click: fereastră de conversație cu un stickman. AI real prin Claude
// (cheia ta, în localStorage) sau fallback scriptat. Stil chatbot (ca ChatGPT).

const MODEL = "claude-haiku-4-5"; // rapid & ieftin; schimbă dacă vrei alt model
const LS_KEY = "stickfigures_anthropic_key";
const histories = {}; // per character id
let current = null;    // agentul cu care vorbești

const apiKey = () => (localStorage.getItem(LS_KEY) || "").trim();
const hasKey = () => apiKey().length > 10;

// ---- construiește fereastra de chat o singură dată ----
const panel = document.createElement("div");
panel.id = "chatPanel";
panel.className = "chat-panel hidden";
panel.innerHTML = `
  <div class="chat-head">
    <span class="dot"></span>
    <span class="cname"></span>
    <button class="chat-gear" title="Cheie AI">⚙</button>
    <button class="chat-close" title="Închide">✕</button>
  </div>
  <div class="chat-banner hidden"></div>
  <div class="chat-log"></div>
  <form class="chat-form"><input type="text" placeholder="Scrie un mesaj..." autocomplete="off"/><button type="submit">➤</button></form>
`;
document.body.appendChild(panel);

const elDot = panel.querySelector(".dot");
const elName = panel.querySelector(".cname");
const elLog = panel.querySelector(".chat-log");
const elForm = panel.querySelector(".chat-form");
const elInput = elForm.querySelector("input");
const elBanner = panel.querySelector(".chat-banner");

function aiStatusText() {
  if (hasKey()) return null; // Claude activ → fără banner
  if (typeof chromeAI !== "undefined" && chromeAI.status === "ready") return "🤖 AI local Chrome (Gemini Nano) activ";
  if (typeof chromeAI !== "undefined" && chromeAI.status === "downloading") return "⏳ AI Chrome se descarcă… momentan mod scriptat";
  return null; // scriptat → fără banner
}
function refreshBanner() { const t = aiStatusText(); if (t) { elBanner.textContent = t; elBanner.classList.remove("hidden"); } else elBanner.classList.add("hidden"); }

function addMsg(who, text) {
  const el = document.createElement("div");
  el.className = "cmsg " + who;
  el.textContent = text;
  elLog.appendChild(el);
  elLog.scrollTop = elLog.scrollHeight;
  return el;
}

// ce zice stickmanul singur/cu alții (chatter, lovire, luptă, salut) → în istoric + live
window.onStickSpeak = function (id, text) {
  if (!histories[id]) histories[id] = [];
  histories[id].push({ role: "ambient", content: text });
  if (histories[id].length > 40) histories[id] = histories[id].slice(-40);
  if (current && current.c.id === id) addMsg("bot ambient", "💭 " + text);
};

window.openChat = function (agent) {
  if (current && current !== agent) current.chatting = false;
  current = agent;
  agent.chatting = true;
  if (agent.opponent) agent.endFight();

  const c = agent.c;
  elDot.style.background = c.color;
  elName.textContent = c.name;
  elName.style.color = c.color;
  panel.style.setProperty("--accent", c.color);
  panel.classList.remove("hidden");
  refreshBanner();

  // restaurează istoricul acestui personaj
  elLog.innerHTML = "";
  if (!histories[c.id]) histories[c.id] = [];
  if (histories[c.id].length === 0) {
    const hi = pick(["Salut! Ce faci?", "Hei! Cu ce te ajut?", "Oh, salut! Zi.", "Bună! Ce mai e nou?"]);
    histories[c.id].push({ role: "assistant", content: hi });
  }
  histories[c.id].forEach(m => {
    if (m.role === "user") addMsg("user", m.content);
    else if (m.role === "ambient") addMsg("bot ambient", "💭 " + m.content);
    else addMsg("bot", m.content);
  });
  setTimeout(() => elInput.focus(), 50);
};

function closeChat() {
  if (current) current.chatting = false;
  current = null;
  panel.classList.add("hidden");
}
panel.querySelector(".chat-close").addEventListener("click", closeChat);

// ⚙ cheie AI (folosit de ambele chat-uri)
function setKeyPrompt() {
  const v = prompt("Lipește cheia ta Claude (sk-ant-...) pentru AI real.\nRămâne doar în browserul tău. Lasă gol ca să o ștergi.", apiKey());
  if (v === null) return;
  if (v.trim()) localStorage.setItem(LS_KEY, v.trim()); else localStorage.removeItem(LS_KEY);
  refreshBanner();
  if (typeof refreshGBanner === "function") refreshGBanner();
}
panel.querySelector(".chat-gear").addEventListener("click", setKeyPrompt);

// trimite mesaj
elForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = elInput.value.trim();
  if (!msg || !current) return;
  elInput.value = "";
  const c = current.c;
  addMsg("user", msg);
  histories[c.id].push({ role: "user", content: msg });
  current.speak(msg, Math.min(500, 150 + msg.length * 4), false); // ce-i scrii apare și deasupra capului

  // comandă specială: cheamă gașca înapoi din excursie
  if (/^veniti|^veniți|întoarce|veniți acasă/i.test(msg) && window.recallAdventurers) {
    const n = window.recallAdventurers();
    addMsg("bot", n > 0 ? "Venim! 🏃" : "Suntem deja aici. 🙂");
  }

  const typing = addMsg("bot typing", "…");
  current.speak("...", 60, false);

  let reply;
  try {
    reply = await aiReply(c, histories[c.id], msg);
  } catch (err) {
    reply = "(eroare AI: " + (err.message || err) + ")";
  }
  typing.remove();
  addMsg("bot", reply);
  histories[c.id].push({ role: "assistant", content: reply });
  if (histories[c.id].length > 40) histories[c.id] = histories[c.id].slice(-40);
  if (current) current.speak(reply, Math.min(600, 180 + reply.length * 4), false); // răspunsul e deja în chat
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function systemPromptFor(c) {
  return `Ești ${c.name}, un stick-figure din gașca lui Alan Becker (Animator vs. Animation). ` +
    `Personalitatea ta: ${c.persona} ` +
    `Vorbește în română, natural și prietenos, ca un chatbot inteligent și util (poți răspunde la orice, ca ChatGPT), ` +
    `dar păstrează-ți mereu personalitatea de ${c.name}. Răspunsuri scurte spre medii, conversaționale. Emoji ocazional, nu exagera.`;
}

async function claudeReply(c, history, retry = 1) {
  const system = systemPromptFor(c);
  const messages = history.filter(h => h.role === "user" || h.role === "assistant").map(h => ({ role: h.role, content: h.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages }),
  });
  if ((res.status === 429 || res.status === 529) && retry > 0) { await sleep(1400); return claudeReply(c, history, retry - 1); }
  if (!res.ok) throw new Error(res.status + " " + (await res.text()).slice(0, 120));
  const data = await res.json();
  const block = (data.content || []).find(b => b.type === "text");
  return block ? block.text.trim() : "(fără răspuns)";
}

// ===== AI LOCAL din Google Chrome (Gemini Nano / Prompt API) — gratuit, rulează în browser =====
// Prioritate răspunsuri: cheie Claude > AI local Chrome (dacă e disponibil) > scriptat.
const chromeAI = {
  api: null,          // "new" (LanguageModel) | "old" (window.ai) | null
  ready: false,       // modelul e utilizabil ACUM
  status: "checking", // checking | ready | downloading | none
  sessions: {},       // sesiune per personaj (păstrează contextul conversației)
  async detect() {
    try {
      if (typeof LanguageModel !== "undefined" && LanguageModel.availability) {
        this.api = "new";
        const a = await LanguageModel.availability();
        if (a === "available") { this.ready = true; this.status = "ready"; }
        else if (a === "downloadable" || a === "downloading") { this.status = "downloading"; this._warm(); }
        else this.status = "none";
      } else if (window.ai && window.ai.languageModel) {
        this.api = "old";
        const cap = await window.ai.languageModel.capabilities();
        const av = cap && cap.available;
        if (av === "readily") { this.ready = true; this.status = "ready"; }
        else if (av === "after-download") { this.status = "downloading"; this._warm(); }
        else this.status = "none";
      } else this.status = "none";
    } catch (e) { this.status = "none"; }
    if (typeof refreshBanner === "function") refreshBanner();
    if (typeof refreshGBanner === "function") refreshGBanner();
    return this.ready;
  },
  async _warm() { // declanșează descărcarea modelului în fundal; când e gata → ready
    try {
      const opt = { monitor(m) { try { m.addEventListener("downloadprogress", () => {}); } catch (e) {} } };
      const s = this.api === "new" ? await LanguageModel.create(opt) : await window.ai.languageModel.create();
      try { s.destroy && s.destroy(); } catch (e) {}
      this.ready = true; this.status = "ready";
      if (typeof refreshBanner === "function") refreshBanner();
      if (typeof refreshGBanner === "function") refreshGBanner();
    } catch (e) { this.status = "none"; }
  },
  async reply(c, history) {
    let s = this.sessions[c.id];
    if (!s) {
      const sys = systemPromptFor(c);
      s = this.api === "new"
        ? await LanguageModel.create({ initialPrompts: [{ role: "system", content: sys }] })
        : await window.ai.languageModel.create({ systemPrompt: sys });
      this.sessions[c.id] = s;
    }
    const lastUser = [...history].reverse().find(h => h.role === "user");
    const out = await s.prompt(lastUser ? lastUser.content : "Salut!");
    return (out || "").trim() || "(fără răspuns)";
  },
};
chromeAI.detect();

// alege backend-ul de răspuns: Claude (cheie) > AI Chrome local > scriptat
async function aiReply(c, history, msg) {
  if (hasKey()) return await claudeReply(c, history);
  if (chromeAI.ready) { try { return await chromeAI.reply(c, history); } catch (e) { return scriptedReply(c, msg); } }
  return scriptedReply(c, msg);
}

// ---- fallback scriptat contextual (fără cheie) — nu răspunsuri random ----
let userName = null;
function tone(c, base) {
  const pre = { red: ["", "Hmph. "], green: ["", "Pace. "], blue: ["", "Logic: "], yellow: ["", "Yo! "], purple: ["", "Mwaha. "], orange: ["", ""] }[c.id] || [""];
  return pick(pre) + base;
}
function scriptedReply(c, msg) {
  const t = msg.toLowerCase().trim();
  let m = t.match(/(?:m[aă] cheam[aă]|numele meu (?:e|este)|eu sunt)\s+([a-zăâîșț]+)/i);
  if (m) { userName = m[1][0].toUpperCase() + m[1].slice(1); return tone(c, `Îmi pare bine, ${userName}! 🙂`); }
  if (/cum m[aă] cheam[aă]|care (?:e|ii|îi) numele meu/.test(t)) return tone(c, userName ? `Te cheamă ${userName}!` : "Nu mi-ai spus încă cum te cheamă.");
  if (/salut|bun[aă]|hei|hello|noroc|servus/.test(t)) return tone(c, pick(["Salut!", "Hei, ce faci?", "Bună!"]));
  if (/ce faci|cum e(ș|s)ti|ce mai faci/.test(t)) return tone(c, pick(c.chatter));
  if (/cine e(ș|s)ti|ce e(ș|s)ti/.test(t)) return tone(c, `Sunt ${c.name}, din gașca lui Alan Becker!`);
  if (/mul(ț|t)umesc|mersi|thx|thanks/.test(t)) return tone(c, "Cu plăcere! 🙂");
  if (/(^|\s)(pa|bye|la revedere|ne vedem)(\s|$)/.test(t)) return tone(c, "Pa! Revino oricând. 👋");
  if (/minecraft|redstone|bloc|construi/.test(t)) return tone(c, "Minecraft! Am construit atâtea acolo. ⛏️");
  if (/lupt[aă]|b[aă]taie|fight/.test(t)) return tone(c, "O luptă? Depinde cu cine. 💪");
  if (/glum[aă]|banc|haios|r[aâ]zi/.test(t)) return tone(c, "Haha! Îmi place umorul. 😄");
  if (/iubes|dragoste|frumos|dr[aă]gu/.test(t)) return tone(c, "Aww, ești de treabă. 🧡");
  if (/aventur[aă]|explor|expedi/.test(t)) return tone(c, "Aventură? Mă bag oricând! 🗺️");
  if (/ajut|help|cum (s[aă]|pot)/.test(t)) return tone(c, "Sigur, spune-mi ce-ți trebuie.");
  if (t.endsWith("?")) return tone(c, pick(["Bună întrebare! Tu cum vezi?", "Hmm, interesant. Spune-mi mai multe.", "Depinde — dă-mi detalii."]));
  if (t.length > 3) return tone(c, pick(["Serios? Spune-mi mai mult.", "Interesant! Și apoi?", "Aha, te ascult.", "De ce zici asta?"]));
  return tone(c, pick(c.chatter));
}

// ================= CHAT DE GRUP (vorbește cu toți) =================
const gbtn = document.createElement("button");
gbtn.id = "groupBtn";
gbtn.textContent = "💬 Vorbește cu toți";
document.body.appendChild(gbtn);

const gpanel = document.createElement("div");
gpanel.className = "chat-panel group hidden";
gpanel.innerHTML = `
  <div class="chat-head">
    <span class="cname" style="color:#cdd3ff">Toată gașca</span>
    <button class="chat-gear" title="Cheie AI">⚙</button>
    <button class="chat-close" title="Închide">✕</button>
  </div>
  <div class="chat-banner hidden"></div>
  <div class="chat-log"></div>
  <form class="chat-form"><input type="text" placeholder="Scrie tuturor..." autocomplete="off"/><button type="submit">➤</button></form>
`;
document.body.appendChild(gpanel);

const gLog = gpanel.querySelector(".chat-log");
const gForm = gpanel.querySelector(".chat-form");
const gInput = gForm.querySelector("input");
const gBanner = gpanel.querySelector(".chat-banner");

function refreshGBanner() { const t = (typeof aiStatusText === "function") ? aiStatusText() : null; if (t) { gBanner.textContent = t; gBanner.classList.remove("hidden"); } else gBanner.classList.add("hidden"); }

function gAdd(who, name, color, text) {
  const el = document.createElement("div");
  el.className = "cmsg " + who;
  if (name) {
    const s = document.createElement("span");
    s.className = "who"; s.textContent = name + ": "; s.style.color = color;
    el.appendChild(s); el.appendChild(document.createTextNode(text));
  } else el.textContent = text;
  gLog.appendChild(el);
  gLog.scrollTop = gLog.scrollHeight;
}

gbtn.addEventListener("click", () => {
  gpanel.classList.toggle("hidden");
  if (!gpanel.classList.contains("hidden")) {
    refreshGBanner();
    if (gLog.childElementCount === 0) gAdd("bot", null, null, "Scrie un mesaj și îți răspund toți cinci 🙂");
    setTimeout(() => gInput.focus(), 50);
  }
});
gpanel.querySelector(".chat-close").addEventListener("click", () => gpanel.classList.add("hidden"));
gpanel.querySelector(".chat-gear").addEventListener("click", setKeyPrompt);

gForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = gInput.value.trim();
  if (!msg) return;
  gInput.value = "";
  gAdd("user", null, null, msg);

  if (/^veniti|^veniți|întoarce|veniți acasă/i.test(msg) && window.recallAdventurers) {
    const n = window.recallAdventurers();
    gAdd("bot", null, null, n > 0 ? "🏃 Se întorc toți din excursie!" : "Sunt deja toți aici. 🙂");
  }

  // secvențial → toți răspund (evită rate-limit-ul care făcea să meargă doar la unii)
  for (const c of CHARACTERS) {
    if (!histories[c.id]) histories[c.id] = [];
    histories[c.id].push({ role: "user", content: msg });
    let r;
    try { r = await aiReply(c, histories[c.id], msg); }
    catch (err) { r = scriptedReply(c, msg); }
    histories[c.id].push({ role: "assistant", content: r });
    if (histories[c.id].length > 40) histories[c.id] = histories[c.id].slice(-40);
    gAdd("bot", c.name, c.color, r);
    const ag = agents.find(a => a.c.id === c.id);
    if (ag) ag.speak(r.length > 22 ? r.slice(0, 20) + "…" : r, 120, false);
  }
});

// ================= BUTON EXPEDIȚIA =================
const ebtn = document.createElement("button");
ebtn.id = "expedBtn"; ebtn.textContent = "🗺️ Expediția";
document.body.appendChild(ebtn);

const epanel = document.createElement("div");
epanel.className = "exped-panel hidden";
epanel.innerHTML = `
  <div class="chat-head"><span class="cname" style="color:#ffd27a">🗺️ Expediția</span><button class="chat-close">✕</button></div>
  <canvas class="exped-screen" width="308" height="130"></canvas>
  <div class="exped-body"></div>
  <button class="exped-toggle"></button>
  <button class="exped-go">🚀 Trimite în expediție</button>`;
document.body.appendChild(epanel);
const eBody = epanel.querySelector(".exped-body");
const escreen = epanel.querySelector(".exped-screen");
const escrx = escreen.getContext("2d");
const ego = epanel.querySelector(".exped-go");
const etoggle = epanel.querySelector(".exped-toggle");
function refreshToggle() {
  const on = window.getAutoAdventure ? window.getAutoAdventure() : true;
  etoggle.textContent = on ? "🚶 Pleacă singuri în expediții: DA" : "🚶 Pleacă singuri în expediții: NU";
  etoggle.classList.toggle("off", !on);
}
etoggle.addEventListener("click", () => {
  const on = window.getAutoAdventure ? window.getAutoAdventure() : true;
  if (window.setAutoAdventure) window.setAutoAdventure(!on);
  refreshToggle();
});
refreshToggle();
epanel.querySelector(".chat-close").addEventListener("click", () => epanel.classList.add("hidden"));

ego.addEventListener("click", () => {
  const r = window.triggerExpedition ? window.triggerExpedition() : null;
  if (r === "already") flashGo("Sunt deja plecați!");
  else if (r === "ok") flashGo("Au pornit! 🚀");
  else flashGo("Prea puțini acasă acum.");
  setTimeout(refreshExped, 100);
});
let goFlash = 0;
function flashGo(txt) { ego.textContent = txt; goFlash = 90; }

function bgFor(place) {
  if (/peșter|pester/i.test(place)) return "#161a2a";
  if (/p[aă]dur/i.test(place)) return "#12281a";
  if (/munte/i.test(place)) return "#20242e";
  if (/insul/i.test(place)) return "#122a2e";
  if (/de[sș]ert/i.test(place)) return "#2a2416";
  if (/castel|nor/i.test(place)) return "#22203a";
  return "#141830";
}
function emojiFor(act) {
  if (/comor/i.test(act)) return "💰"; if (/dragon/i.test(act)) return "🐉";
  if (/peșter|pester/i.test(act)) return "🦇"; if (/baz[aă]|construi/i.test(act)) return "🏗️";
  if (/cub/i.test(act)) return "🧊"; if (/diamant/i.test(act)) return "💎";
  return "⭐";
}
function drawMini(g, x, gy, color, phase, hollow, crown) {
  g.save(); g.translate(x, gy); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round";
  const hipY = -18, shY = -30, r = 5, hy = shY - 4 - r, sw = Math.sin(phase) * 4;
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(-4 + sw, 0); g.stroke();
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(4 - sw, 0); g.stroke();
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(0, shY); g.stroke();
  g.beginPath(); g.moveTo(0, shY + 2); g.lineTo(-5 - sw, shY + 9); g.stroke();
  g.beginPath(); g.moveTo(0, shY + 2); g.lineTo(5 + sw, shY + 9); g.stroke();
  g.beginPath(); g.arc(0, hy, r, 0, Math.PI * 2); if (hollow) g.stroke(); else g.fill();
  if (crown) { g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(-6, hy - r); g.lineTo(-6, hy - r - 3); g.lineTo(-3, hy - r - 1); g.lineTo(0, hy - r - 4); g.lineTo(3, hy - r - 1); g.lineTo(6, hy - r - 3); g.lineTo(6, hy - r); g.closePath(); g.fill(); }
  g.restore();
}
function renderScreen() {
  if (epanel.classList.contains("hidden")) return;
  const info = window.getExpedition ? window.getExpedition() : { active: false };
  const g = escrx, W = escreen.width, H = escreen.height, gy = H - 16;
  if (!info.active) {
    g.fillStyle = "#0e1024"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#667"; g.font = "13px 'Segoe UI', sans-serif"; g.textAlign = "center";
    g.fillText("— nimeni în expediție —", W / 2, H / 2);
  } else {
    g.fillStyle = bgFor(info.place); g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
    g.font = "30px serif"; g.textAlign = "center"; g.fillText(emojiFor(info.activity), W - 30, 40);
    g.fillStyle = "rgba(255,255,255,0.5)"; g.font = "11px 'Segoe UI', sans-serif"; g.textAlign = "left"; g.fillText(info.place, 8, 16);
    const t = performance.now() / 1000, mem = info.members || [];
    mem.forEach((m, i) => {
      const span = (W - 70) / Math.max(1, mem.length);
      const x = 30 + i * span + Math.sin(t * 1.1 + i) * (span * 0.35);
      drawMini(g, x, gy, m.color, t * 4 + i * 1.7, m.hollowHead, m.crown);
    });
  }
  if (goFlash > 0 && --goFlash === 0) ego.textContent = "🚀 Trimite în expediție";
  requestAnimationFrame(renderScreen);
}

// buton individual / toți (delegare — supraviețuiește la re-randare)
eBody.addEventListener("click", (e) => {
  const one = e.target.closest(".exped-recall1");
  if (one) { if (window.recallOne) window.recallOne(one.dataset.name); refreshExped(); return; }
  if (e.target.closest(".exped-recall-all")) { if (window.recallAdventurers) window.recallAdventurers(); refreshExped(); }
});

let expedTick = null;
function refreshExped() {
  const info = window.getExpedition ? window.getExpedition() : { active: false };
  ego.style.display = info.active ? "none" : "block";
  if (!info.active) { eBody.innerHTML = `<p class="exped-empty">Nimeni nu e plecat acum.</p><p class="exped-hint">Apasă butonul de jos ca să-i trimiți, sau așteaptă ca Orange să strige „Aventură!". Scrie <b>veniti</b> în chat ca să-i chemi.</p>`; return; }
  const t = info.remaining === null ? "pornesc chiar acum…" : `se întorc în ~${Math.floor(info.remaining / 60)}:${String(info.remaining % 60).padStart(2, "0")}`;
  const rows = (info.members || []).map(m => `<div class="exped-mem"><span class="exped-mem-name" style="color:${m.color}">● ${m.name}</span><button class="exped-recall1" data-name="${m.name}" title="Întoarce-l pe ${m.name}">↩</button></div>`).join("");
  eBody.innerHTML = `<p class="exped-line">📍 <b>${info.place}</b> — ${info.activity}</p><p class="exped-line">⏳ ${t}</p><div class="exped-mems">${rows}</div><button class="exped-recall-all">↩ Întoarce toți</button>`;
}
ebtn.addEventListener("click", () => {
  epanel.classList.toggle("hidden");
  if (!epanel.classList.contains("hidden")) { refreshToggle(); refreshExped(); expedTick = setInterval(refreshExped, 1000); requestAnimationFrame(renderScreen); }
  else if (expedTick) { clearInterval(expedTick); expedTick = null; }
});
