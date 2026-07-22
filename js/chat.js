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

  // comandă specială: „construiește-mi / desenează-mi un X" → chiar îl desenează în scenă
  const want = buildRequest(msg);
  if (want) {
    const who = current;
    const done = (r) => { addMsg("bot", r); histories[c.id].push({ role: "assistant", content: r }); };
    if (window.stickBuild && window.stickBuild(who, want)) { done("Gata, îl fac acum! 🎨"); return; }
    if (hasKey()) {   // nu-l știe din bibliotecă → îi cere lui Claude conturul și desenează exact aia
      const t2 = addMsg("bot typing", "🎨 desenez…");
      try {
        const strokes = await claudeStrokes(want);
        t2.remove();
        if (window.stickDrawStrokes && window.stickDrawStrokes(who, want, strokes)) { done("Uite: " + want + " 🎨"); return; }
      } catch (err) { t2.remove(); }
    }
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

// „fă-mi o casă", „desenează un dragon", „construiește-mi un turn" …
// Întoarce CE anume a cerut (ex. „dragon violet") sau null dacă mesajul nu e o comandă de desen.
const stripD = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function buildRequest(msg) {
  const t = stripD(msg).replace(/[?!.,\s]+$/, "").trim();
  if (/^(ce|cum|unde|cand|cine|care|oare)\s/.test(t)) return null;   // e o întrebare, nu o comandă
  const m = t.match(/(?:^|\s)(construieste|constuieste|construiesti|construiti|construim|deseneaza|deseneazami|deseneazane|creeaza|fabrica|fa|faci|poti\s+face)(?:[\s-]*(?:mi|ne|imi|mie|nou[aă]))?(?:\s+te\s+rog)?[\s-]+(?:un|o|niste|nist|doua|2)?\s*(.{2,70})$/);
  if (!m) return null;
  const what = m[2].replace(/^(te rog|va rog)\s+/, "").trim();
  // „ce mai faci", „fă ce vrei", „fă ceva" → nu sunt comenzi de desen
  if (!what || /^(ce|cum|unde|cand|cine|de|sa|ceva|orice|nimic|bine|ok)\b/.test(what)) return null;
  return what;
}

// Cere lui Claude conturul obiectului ca linii într-un pătrat -1..1 → stickmanul îl desenează exact.
async function claudeStrokes(what) {
  const system = "Ești un generator de desene-linie pentru un joc cu stick-figures. " +
    "Primești numele unui obiect și întorci DOAR JSON, fără text în jur, fără markdown: " +
    '{"strokes":[[[x,y],[x,y],...],...]}. ' +
    "Fiecare stroke e o linie continuă (polilinie) de trasat cu creionul. Coordonate în pătratul " +
    "[-1,1] × [-1,1], cu y POZITIV ÎN JOS. Umple bine pătratul. Maximum 14 strokuri și 30 de puncte " +
    "pe stroke. Fă un desen simplu, recognoscibil, din linii — ca un desen de copil pe tablă. " +
    "Pentru contururi închise repetă primul punct la final. Fără umpluturi, doar linii.";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1600, system, messages: [{ role: "user", content: String(what).slice(0, 120) }] }),
  });
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  const txt = ((data.content || []).find(b => b.type === "text") || {}).text || "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("fara json");
  return JSON.parse(m[0]).strokes;
}

function systemPromptFor(c) {
  return `Ești ${c.name}, un stick-figure din gașca lui Alan Becker (Animator vs. Animation). ` +
    `Personalitatea ta: ${c.persona} ` +
    `Vorbește în română, natural și prietenos, ca un chatbot inteligent și util (poți răspunde la orice, ca ChatGPT), ` +
    `dar păstrează-ți mereu personalitatea de ${c.name}. ` +
    `RĂSPUNSURI FOARTE SCURTE: una-două propoziții, maximum ~35 de cuvinte. Ca o replică vorbită, nu ca un articol. ` +
    `Fără liste, fără explicații lungi, fără introduceri de tipul „Sigur, hai să...". Intri direct în subiect. ` +
    `Dacă întrebarea chiar cere mai mult, dai esențialul într-o frază și întrebi dacă să detaliezi. Emoji ocazional, nu exagera.`;
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
    body: JSON.stringify({ model: MODEL, max_tokens: 160, system, messages }),   // plafon mic = raspunsuri scurte
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

// alege backend-ul de răspuns: Claude (cheie) > AI Chrome local > scriptat.
// NU se agață niciodată: Chrome AI are timeout; dacă eșuează/încetinește, cade pe scriptat.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
async function aiReply(c, history, msg) {
  if (hasKey()) return await claudeReply(c, history);
  if (chromeAI.ready) {
    try {
      const r = await withTimeout(chromeAI.reply(c, history), 12000);
      if (r && r.trim() && r !== "(fără răspuns)") { chromeAI.fails = 0; return r.trim(); }
      throw new Error("gol");
    } catch (e) {
      chromeAI.fails = (chromeAI.fails || 0) + 1;
      if (chromeAI.fails >= 2) { chromeAI.ready = false; chromeAI.status = "none"; try { refreshBanner(); refreshGBanner(); } catch (_) {} } // renunță la Chrome AI dacă tot nu merge
      return scriptedReply(c, msg); // răspuns garantat, nu rămâne pe "…"
    }
  }
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

// ---- temă vizuală per loc (cer + sol + decor de fundal) ----
function placeTheme(place) {
  const p = (place || "").toLowerCase();
  if (p.includes("munte")) return { sky: ["#2a3350", "#5a6690"], ground: "#39425f", scenery: scMountains };
  if (p.includes("redstone")) return { sky: ["#140f16", "#2a1820"], ground: "#1c1620", scenery: scCave };
  if (p.includes("dure")) return { sky: ["#12241a", "#20402a"], ground: "#152a1b", scenery: scForest };
  if (p.includes("insul")) return { sky: ["#1a3a5a", "#3a86a8"], ground: "#cdb46e", scenery: scIsland };
  if (p.includes("animator")) return { sky: ["#0e0e1e", "#20203a"], ground: "#26264a", scenery: scAnimator };
  if (p.includes("nisip")) return { sky: ["#7a5a2a", "#d8b25a"], ground: "#cfa752", scenery: scDesert };
  if (p.includes("castel") || p.includes("nori")) return { sky: ["#3a3a6a", "#8a8ad0"], ground: "#6a6aa0", scenery: scCastle };
  return { sky: ["#141830", "#2a2e50"], ground: "#20243e", scenery: () => {} };
}
function scMountains(g, W, gy, t) { g.fillStyle = "#2b3350"; for (const [x, h] of [[60, 70], [150, 95], [250, 75]]) { g.beginPath(); g.moveTo(x - h * 0.8, gy); g.lineTo(x, gy - h); g.lineTo(x + h * 0.8, gy); g.fill(); g.fillStyle = "#e8ecff"; g.beginPath(); g.moveTo(x - 12, gy - h + 16); g.lineTo(x, gy - h); g.lineTo(x + 12, gy - h + 16); g.fill(); g.fillStyle = "#2b3350"; } }
function scCave(g, W, gy, t) { g.fillStyle = "#0d0a10"; for (let i = 0; i < 8; i++) { const x = 20 + i * 38; g.beginPath(); g.moveTo(x - 7, 0); g.lineTo(x + 7, 0); g.lineTo(x, 14 + (i % 3) * 8); g.fill(); } g.fillStyle = "#e0402c"; for (let i = 0; i < 5; i++) { const x = 40 + i * 55, y = gy - 22 - (i % 2) * 10; g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3 + i); g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
function scForest(g, W, gy, t) { for (let i = 0; i < 6; i++) { const x = 24 + i * 50, h = 46 + (i % 3) * 14; g.fillStyle = "#3a2a18"; g.fillRect(x - 3, gy - h * 0.4, 6, h * 0.4); g.fillStyle = i % 2 ? "#1f4a28" : "#2a5a32"; g.beginPath(); g.moveTo(x - 16, gy - h * 0.35); g.lineTo(x, gy - h); g.lineTo(x + 16, gy - h * 0.35); g.fill(); } }
function scIsland(g, W, gy, t) { g.fillStyle = "#2a7a9a"; g.fillRect(0, gy + 8, W, 20); g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 1.5; g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, gy + 10 + Math.sin(x * 0.2 + t * 2) * 2); g.stroke(); g.fillStyle = "#6a4a2a"; g.fillRect(W - 60, gy - 30, 5, 30); g.fillStyle = "#2fa84a"; for (const a of [-0.6, -0.2, 0.2, 0.6]) { g.beginPath(); g.moveTo(W - 57, gy - 30); g.quadraticCurveTo(W - 57 + Math.cos(a) * 30, gy - 44, W - 57 + Math.cos(a) * 44, gy - 34); g.quadraticCurveTo(W - 57 + Math.cos(a) * 26, gy - 34, W - 57, gy - 28); g.fill(); } }
function scAnimator(g, W, gy, t) { g.strokeStyle = "rgba(120,140,255,0.18)"; g.lineWidth = 1; for (let x = 0; x <= W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, gy); g.stroke(); } for (let y = 0; y <= gy; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
function scDesert(g, W, gy, t) { g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(46, 32, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = "#b8863e"; for (const [x, r] of [[80, 40], [200, 55], [300, 45]]) { g.beginPath(); g.moveTo(x - r, gy); g.quadraticCurveTo(x, gy - r * 0.5, x + r, gy); g.fill(); } }
function scCastle(g, W, gy, t) { g.fillStyle = "rgba(255,255,255,0.7)"; for (const [x, y, r] of [[50, 30, 14], [120, 22, 18], [240, 34, 15]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.arc(x + r, y + 3, r * 0.8, 0, Math.PI * 2); g.arc(x - r, y + 3, r * 0.7, 0, Math.PI * 2); g.fill(); } g.fillStyle = "#8a8ad8"; const bx = W - 78; g.fillRect(bx, gy - 40, 46, 40); for (let i = 0; i < 4; i++) g.fillRect(bx + i * 12, gy - 46, 8, 8); g.fillStyle = "#3a3a6a"; g.fillRect(bx + 18, gy - 20, 10, 20); }
// ---- prop-uri activitate ----
function drawDragon(g, x, y, t) { const f = Math.sin(t * 4) * 6; g.fillStyle = "#7a3a8a"; g.beginPath(); g.ellipse(x, y, 22, 13, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x - 20, y); g.quadraticCurveTo(x - 40, y - 6, x - 46, y + 8); g.lineWidth = 5; g.strokeStyle = "#7a3a8a"; g.stroke(); g.fillStyle = "#933fa8"; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x - 8, y - 22 - f); g.lineTo(x + 14, y - 8); g.fill(); g.beginPath(); g.moveTo(x + 6, y - 4); g.lineTo(x + 16, y - 20 - f); g.lineTo(x + 24, y - 6); g.fill(); g.fillStyle = "#7a3a8a"; g.beginPath(); g.arc(x + 20, y - 6, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = "#ffcf3f"; g.beginPath(); g.arc(x + 23, y - 8, 1.6, 0, Math.PI * 2); g.fill(); g.fillStyle = "#ff7a2e"; g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 8); g.beginPath(); g.moveTo(x + 27, y - 6); g.lineTo(x + 44, y - 9); g.lineTo(x + 27, y - 2); g.fill(); g.globalAlpha = 1; }
function drawChest(g, x, gy, t) { const y = gy - 20; g.fillStyle = "#6a4a24"; g.fillRect(x - 16, y, 32, 20); g.fillStyle = "#8a6432"; g.fillRect(x - 16, y - 10, 32, 12); g.fillStyle = "#ffd23f"; g.fillRect(x - 3, y - 12, 6, 24); g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4); g.fillStyle = "#fff6c0"; g.beginPath(); g.arc(x + 10, y - 16, 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
function drawDiamonds(g, W, gy, t) { for (let i = 0; i < 4; i++) { const x = W * 0.5 + i * 26, s = 6, y = gy - 8; g.fillStyle = "#4fd6e6"; g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 4 + i); g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.fill(); } g.globalAlpha = 1; }
function drawBase(g, x, gy, t) { const cols = ["#c0764a", "#7a9a4a", "#5a7ab0"]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) { g.fillStyle = cols[(r + c) % 3]; g.fillRect(x - 24 + c * 14 + r * 7, gy - 12 - r * 12, 12, 12); g.strokeStyle = "rgba(0,0,0,0.3)"; g.strokeRect(x - 24 + c * 14 + r * 7, gy - 12 - r * 12, 12, 12); } }
function drawCube(g, x, y, t) { const f = Math.sin(t * 2) * 4; y -= f; g.save(); g.globalAlpha = 0.9; g.fillStyle = "#7ee6ff"; g.fillRect(x - 10, y - 10, 20, 20); g.fillStyle = "#4fb8d6"; g.beginPath(); g.moveTo(x + 10, y - 10); g.lineTo(x + 16, y - 16); g.lineTo(x + 16, y + 4); g.lineTo(x + 10, y + 10); g.fill(); g.fillStyle = "#a6f0ff"; g.beginPath(); g.moveTo(x - 10, y - 10); g.lineTo(x - 4, y - 16); g.lineTo(x + 16, y - 16); g.lineTo(x + 10, y - 10); g.fill(); g.restore(); }
function drawTorch(g, x, gy, t) { g.strokeStyle = "#6a4a2a"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy - 14); g.stroke(); g.fillStyle = "#ff9a2e"; g.globalAlpha = 0.85; const f = Math.sin(t * 9) * 2; g.beginPath(); g.moveTo(x - 4, gy - 14); g.quadraticCurveTo(x, gy - 26 - f, x + 4, gy - 14); g.fill(); g.fillStyle = "#ffe14d"; g.beginPath(); g.moveTo(x - 2, gy - 14); g.quadraticCurveTo(x, gy - 21 - f, x + 2, gy - 14); g.fill(); g.globalAlpha = 1; }
function drawActivity(g, W, gy, activity, members, t) {
  const a = (activity || "").toLowerCase(), cx = W * 0.62;
  let action = "walk";
  if (a.includes("dragon")) { drawDragon(g, cx + 30, gy - 20, t); action = "swing"; }
  else if (a.includes("comor")) { drawChest(g, cx + 40, gy, t); action = "dig"; }
  else if (a.includes("diamant")) { drawDiamonds(g, W, gy, t); action = "reach"; }
  else if (a.includes("construi") || a.includes("baz")) { drawBase(g, cx + 34, gy, t); action = "swing"; }
  else if (a.includes("cub")) { drawCube(g, cx + 40, gy - 20, t); action = "reach"; }
  else if (a.includes("explor")) { action = "walk"; } // peșteră → torța o ține un membru (mai jos)
  const exploring = a.includes("explor");
  members.forEach((m, i) => {
    const x = W * 0.15 + i * 26 + Math.sin(t * 1.4 + i) * 3;
    const face = x <= cx ? 1 : -1;
    drawMini(g, x, gy, m.color, t * 5 + i * 1.6, m.hollowHead, m.crown, action, face);
    if (exploring && i === 0) drawTorch(g, x + 9, gy, t);
  });
}
function drawMini(g, x, gy, color, phase, hollow, crown, action, face) {
  g.save(); g.translate(x, gy); g.scale(face || 1, 1); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round";
  const hipY = -18, shY = -30, r = 5, hy = shY - 4 - r, sw = Math.sin(phase) * 4;
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(-4 + sw, 0); g.stroke();
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(4 - sw, 0); g.stroke();
  g.beginPath(); g.moveTo(0, hipY); g.lineTo(0, shY); g.stroke();
  const arm = (ex, ey) => { g.beginPath(); g.moveTo(0, shY + 2); g.lineTo(ex, ey); g.stroke(); };
  if (action === "swing") { const a = Math.sin(phase * 3) * 7; arm(9, shY - 5 + a); arm(-5, shY + 9); }       // lovește (sabie/pumn)
  else if (action === "dig") { const a = Math.abs(Math.sin(phase * 3)) * 7; arm(8, shY + 9 - a); arm(-7, shY + 9 - a); } // sapă
  else if (action === "reach") { arm(7, shY - 9); arm(-6, shY + 8); }                                          // se întinde/culege
  else { arm(-5 - sw, shY + 9); arm(5 + sw, shY + 9); }                                                        // merge
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
    const t = performance.now() / 1000, theme = placeTheme(info.place);
    const grd = g.createLinearGradient(0, 0, 0, gy); grd.addColorStop(0, theme.sky[0]); grd.addColorStop(1, theme.sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, gy);
    theme.scenery(g, W, gy, t);                                  // decor de fundal (munți/copaci/dune/...)
    g.fillStyle = theme.ground; g.fillRect(0, gy, W, H - gy);    // sol
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
    drawActivity(g, W, gy, info.activity, info.members || [], t); // prop + membrii care fac exact activitatea
    // etichete: locul + activitatea (fix ce zic)
    g.textAlign = "left"; g.font = "bold 11px 'Segoe UI',sans-serif";
    g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(4, 4, g.measureText(info.place).width + 10, 16);
    g.fillStyle = "#fff"; g.fillText(info.place, 9, 16);
    g.font = "10px 'Segoe UI',sans-serif"; g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText("⚔️ " + info.activity, 9, H - 5);
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

// ================= AJUTOR: CONTROALE (❔) =================
const hbtn = document.createElement("button");
hbtn.textContent = "❔ Taste";
hbtn.style.cssText = "position:fixed;top:10px;right:12px;z-index:60;background:#1e2130;color:#cdd3ff;border:1px solid #3a3f5a;border-radius:9px;padding:7px 13px;font:600 13px 'Segoe UI',sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.4);";
document.body.appendChild(hbtn);
const hpanel = document.createElement("div");
hpanel.style.cssText = "position:fixed;top:50px;right:12px;z-index:60;width:298px;background:rgba(18,20,32,0.97);color:#dfe3f5;border:1px solid #3a3f5a;border-radius:12px;padding:14px 16px;font:13px 'Segoe UI',sans-serif;line-height:1.75;box-shadow:0 10px 34px rgba(0,0,0,0.55);display:none;";
hpanel.innerHTML = `<b style="color:#8ee6a0">🎮 Controalele tale</b><br>
<b>R</b> — creează-ți personajul („TU")<br>
<b>A / D</b> sau <b>← →</b> — mișcare<br>
<b>Space</b> — salt · în aer = double jump · pe perete = <b>wall-jump</b><br>
<b>Shift</b> — dash (și în aer) · prin cineva = <b>șarjă</b><br>
<b>E</b> — <b>lovește</b>: pumn → șut → lovitura de final (te ripostează!)<br>
<b>Ctrl</b> — sprint (fugă)<br>
<i style="color:#9aa0b0">Ține A/D spre un perete (desen, casă, fereastră sau marginea<br>ecranului) ca să te agăți, apoi Space = wall-jump.</i><br>
<b>T</b> — șterge-ți personajul
<hr style="border:none;border-top:1px solid #333a55;margin:9px 0">
<b style="color:#8ee6a0">🖱️ Cu mouse-ul</b><br>
<b>Click</b> pe stickman — lovește (dublu = provoacă)<br>
<b>Trage</b> un stickman — îl ridici & arunci<br>
<b>Click</b> pe o construcție — o distrugi (trage = muți)<br>
<b>Click dreapta</b> pe stickman — chat<br>
<i style="color:#9aa0b0">In chat: „fă-mi o rachetă", „desenează un robot" → chiar îl<br>desenează în scenă (și devine platformă de parkour).</i><br>
<b>H</b> — arată hitbox-urile · <b>G</b> — efecte`;
document.body.appendChild(hpanel);
hbtn.addEventListener("click", () => { hpanel.style.display = hpanel.style.display === "none" ? "block" : "none"; hbtn.blur(); });
