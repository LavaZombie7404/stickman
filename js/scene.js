// Stick Gang — motor de scenă cu animații realiste (cinematică inversă), fețe expresive,
// fizică (apucă & aruncă), și interacțiuni. Păstrează: chat, aventură, foc, construcții,
// coliziune, somn, salt, "veniti".

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

let groundY = 0;
let structures = [];
let particles = []; // praf la aterizare
let drawings = [];  // desene pe wallpaper
let weapons = [];   // arme desenate în Paint (sabie/arc), lăsate pe jos (de luat)
let arrows = [];    // săgeți în zbor

// proporții schelet
const HIP_Y = -52, THIGH = 26, SHIN = 26, TORSO = 44, NECK = 8, UPPER = 20, FORE = 18;
const SHOULDER_Y = HIP_Y - TORSO;

// cinematică inversă cu 2 segmente → poziția genunchiului/cotului
function solveIK(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy) || 0.0001;
  const nx = dx / d, ny = dy / d;
  d = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + nx * a, my = ay + ny * a;
  return { x: mx - ny * h * bend, y: my + nx * h * bend };
}

function spawnDust(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ x, y, vx: rand(-2.2, 2.2), vy: rand(-2.6, -0.3), life: rand(18, 32), r: rand(2, 5) });
  }
}

function wrapText(text, maxLen) {
  const words = String(text).split(/\s+/);
  const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxLen && cur) { lines.push(cur); cur = w; }
    else cur = (cur ? cur + " " : "") + w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

class Agent {
  constructor(c, W) {
    this.c = c;
    this.x = rand(120, W - 120);
    this.face = Math.random() < 0.5 ? 1 : -1;
    this.speed = rand(0.55, 0.95);
    this.state = "walk";
    this.targetX = null;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.bob = Math.random() * Math.PI * 2;
    this.vx = 0;
    this.stateTimer = rand(60, 200);
    this.hitCooldown = 0;
    this.opponent = null;
    this.punchTimer = 0;
    this.attacker = false;
    this.attackType = "punch";
    this.attackAnim = 0;
    this.recoil = 0;
    this.stars = [];
    this.say = null;
    this.chatterTimer = rand(300, 900);
    this.lie = 0;
    this.sleepPhase = null;
    this.sleepTimer = 0;
    this.sleepDir = 1;
    this.sleepCd = rand(3600, 18000);
    this.chatting = false;
    this.building = null;
    this.buildTimer = 0;
    this.buildDur = 0;
    this.builtCount = 0;
    this.jumping = false;
    this.jumpT = 0;
    this.jumpCd = 0;
    this.away = false;
    this.awayTimer = 0;
    this.exitX = 0;
    this.adventure = false;
    this.burning = false;
    this.burnTimer = 0;
    this.willWater = false;
    this.waterAnim = 0;
    this.burnCd = 0;
    // animație expresivă
    this.blinkTimer = rand(90, 300);
    this.blink = 0;
    this.lookX = 0; this.lookY = 0;   // privire (spre cursor)
    this.squash = 0;                  // squash & stretch la aterizare
    this.startle = 0;                 // tresărire la cursor rapid
    this.waveTimer = 0;               // salut
    this.greetCd = 0;
    // fizică aruncare
    this.tz = 0; this.tzv = 0; this.tvx = 0; this.tangle = 0; this.tangVel = 0; this.bounces = 0;
    this.heldY = 0;
    this.scaredTimer = 0; this.fleeDir = 1; this.fleeTimer = 0;
    this.watchTarget = 0; // se uită la Chrome
    this.doodle = null; this.doodleReveal = 0; this.drawTimer = 0; // desenat pe wallpaper
    this.weapon = null; // "sword" | "bow" | null
  }

  enterScared() {
    this.state = "scared"; this.scaredTimer = 180; this.fleeTimer = 0; // ~3s
    this.lie = 0; this.sleepPhase = null;
    this.fleeDir = this.x < pointer.x ? -1 : 1;
    this.speak(pick(["Aaah!", "Sperietură!", "Nu mă prinde!"]), 60);
  }

  stayOnWindow(w, px, py) { // lăsat/aruncat pe o fereastră → aterizează pe podeaua ei și stă acolo
    this.state = "onwin"; this.onWin = w;
    this.x = clamp(px, w.x + 16, w.x + w.w - 16);
    this.onWinVX = 0; this.onWinTimer = rand(30, 90);
    this.lie = 0; this.sleepPhase = null; this.jumping = false; this.building = null; this.tz = 0;
    if (this.opponent) this.endFight();
    this.speak(pick(["Aici stau!", "Ce loc!", "Podea nouă!"]), 80);
  }
  updateOnWin(W) {
    if (this.say) { if (--this.say.ttl <= 0) this.say = null; }
    const w = this.onWin;
    if (!w || !standWindows().includes(w)) { // fereastra s-a închis → cade jos
      this.onWin = null; this.state = "thrown"; this.tzv = 0; this.tvx = 0; this.tangle = 0; this.tangVel = 0; this.bounces = 0; return;
    }
    const floorY = w.y; // stă PE fereastră (pe marginea de sus), nu în ea
    this.tz = groundY - floorY; // picioarele pe partea de sus a ferestrei
    const lo = w.x + 16, hi = w.x + w.w - 16;
    if (--this.onWinTimer <= 0) {
      if (Math.random() < 0.45) { this.onWinVX = (Math.random() < 0.5 ? -1 : 1) * this.speed; this.onWinTimer = rand(40, 110); }
      else { this.onWinVX = 0; this.onWinTimer = rand(40, 100); }
    }
    if (this.onWinVX) {
      this.x += this.onWinVX; this.face = Math.sign(this.onWinVX); this.walkPhase += 0.14;
      if (this.x <= lo || this.x >= hi) { this.onWinVX *= -1; }
    }
    this.x = clamp(this.x, lo, hi);
  }
  stayOnDrawing(d) { // lăsat (drag) pe un desen → rămâne agățat acolo
    this.state = "climb"; this.climbT = d; this.climbPhase = "hang";
    this.x = d.cx; this.tz = clamp(groundY - d.cy - 130, 30, groundY - 20);
    this.hangTz = this.tz; this.hangTimer = 100000;
    this.face = 1; this.lie = 0; this.sleepPhase = null; this.jumping = false; this.building = null;
    if (this.opponent) this.endFight();
    this.speak(pick(["M-am agățat! 🧗", "Aici stau!", "Sus!"]), 80);
  }
  landOnDrawing(d) { // aterizează și STĂ pe vârful desenului (coliziune pe top, ca la ferestre)
    this.state = "ondraw"; this.onDraw = d;
    this.tz = groundY - (d.cy - d.s);            // picioarele pe partea de sus a desenului
    this.x = clamp(this.x, d.cx - d.s + 6, d.cx + d.s - 6);
    this.onDrawVX = 0; this.onDrawTimer = rand(30, 90);
    this.lie = 0; this.sleepPhase = null; this.jumping = false; this.building = null;
    if (this.opponent) this.endFight();
    this.speak(pick(["Sus pe desen! 🧗", "Aici stau!", "Ce loc!"]), 80);
  }
  updateOnDraw(W) {
    if (this.say) { if (--this.say.ttl <= 0) this.say = null; }
    const d = this.onDraw;
    if (!d || !drawings.includes(d)) { // desenul a dispărut → cade jos
      this.onDraw = null; this.state = "thrown"; this.tzv = 0; this.tvx = 0; this.tangle = 0; this.tangVel = 0; this.bounces = 0; return;
    }
    this.tz = groundY - (d.cy - d.s);            // rămâne pe top (chiar dacă desenul e mutat cândva)
    const lo = d.cx - d.s + 6, hi = d.cx + d.s - 6;
    if (--this.onDrawTimer <= 0) {
      if (Math.random() < 0.4) { this.onDrawVX = (Math.random() < 0.5 ? -1 : 1) * this.speed; this.onDrawTimer = rand(40, 110); }
      else { this.onDrawVX = 0; this.onDrawTimer = rand(40, 100); }
    }
    if (this.onDrawVX) {
      this.x += this.onDrawVX; this.face = Math.sign(this.onDrawVX); this.walkPhase += 0.14;
      if (this.x <= lo || this.x >= hi) this.onDrawVX *= -1;
    }
    this.x = clamp(this.x, lo, hi);
  }

  returnFromAdventure(W) {
    this.away = false; this.adventure = false;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.x = side < 0 ? 60 : W - 60;
    this.face = side < 0 ? 1 : -1;
    this.state = "walk"; this.targetX = rand(220, W - 220);
    this.speak(this.c.id === "orange" ? "Ce aventură!" : "Ne-am întors!", 140);
  }

  wouldCollide(nx) {
    if (this.jumping) return false;
    for (const o of agents) {
      if (o === this || o.away || o.jumping || o.state === "held" || o.state === "thrown") continue;
      const gap = (o.state === "sleep" && o.lie > 0.3) ? 74 : 38; // cei culcați ocupă mai mult
      if (Math.abs(nx - o.x) < gap && Math.abs(nx - o.x) < Math.abs(this.x - o.x)) return true;
    }
    return false;
  }

  speak(text, ttl = 120, ambient = true) {
    this.say = { text, ttl };
    if (ambient && typeof window.onStickSpeak === "function") window.onStickSpeak(this.c.id, text);
  }

  getHit(fromX) {
    if (this.hitCooldown > 0 || this.state === "held" || this.state === "thrown") return;
    this.hitCooldown = 40;
    this.state = "hit";
    this.stateTimer = 40;
    this.lie = 0; this.sleepPhase = null; this.building = null;
    this.vx = (this.x >= fromX ? 1 : -1) * 10;
    this.recoil = 16;
    this.stars = [];
    for (let i = 0; i < 4; i++) this.stars.push({ ang: (Math.PI * 2 * i) / 4, r: 30 });
    this.speak(pick(this.c.hitLines), 70);
    if (this.opponent) this.endFight();
  }

  grab() {
    this.state = "held";
    this.landWin = null; this.landStruct = null; this.landDrawing = null;
    this.heldY = Math.min(pointer.y, groundY);
    this.jumping = false; this.burning = false; this.building = null;
    this.lie = 0; this.sleepPhase = null; this.sleepCd = rand(3600, 18000); // se trezește dacă dormea
    if (this.opponent) this.endFight();
    this.speak(pick(["Hei!", "Uau!", "Aaah!", "Pune-mă jos!"]), 90);
  }
  release(vx, vy) {
    this.state = "thrown";
    this.tz = Math.max(0, groundY - this.heldY);
    this.tvx = clamp(vx, -22, 22);
    this.tzv = clamp(vy, -26, 8);
    this.tangle = 0;
    this.tangVel = clamp(vx, -22, 22) * 0.03 + rand(-0.05, 0.05);
    this.bounces = 0;
    this.face = this.tvx >= 0 ? 1 : -1;
    this.speak(pick(["Woohoo!", "Aaaa!", "Zbooor!"]), 80);
  }

  die() { // lovit mortal de sabie → cade, apoi reînvie
    if (this.opponent) this.endFight();
    this.opponent = null; this.attacker = false;
    this.state = "dead"; this.deadTimer = rand(200, 340); this.lie = 1; this.sleepPhase = null;
    this.sleepDir = Math.random() < 0.5 ? 1 : -1; this.weapon = null; this.stars = [];
    this.speak(pick(["Aaargh!", "M-ai... învins...", "Gata cu mine..."]), 70);
  }
  startFight(other) {
    this.state = "fight"; this.opponent = other; this.stateTimer = rand(300, 520);
    this.attacker = true; this.punchTimer = 34;
    this.speak(pick(this.c.fightLines), 90);
  }
  endFight() {
    if (this.opponent) { this.opponent.opponent = null; this.opponent.state = "walk"; this.opponent.stateTimer = rand(60, 160); }
    this.opponent = null; this.state = "walk"; this.stateTimer = rand(60, 160);
  }

  update(W) {
    if (this.away) { if (--this.awayTimer <= 0) this.returnFromAdventure(W); return; }

    this.bob += 0.06;
    if (this.hitCooldown > 0) this.hitCooldown--;
    if (this.attackAnim > 0) this.attackAnim--;
    if (this.recoil > 0.5) this.recoil *= 0.85; else this.recoil = 0;
    if (this.squash > 0) this.squash *= 0.82;
    if (this.startle > 0) this.startle--;
    if (this.waveTimer > 0) this.waveTimer--;
    if (this.greetCd > 0) this.greetCd--;
    this.stars.forEach(s => { s.ang += 0.2; s.r *= 0.96; });

    // stări care ignoră restul
    if (this.state === "dead") { if (this.say) { if (--this.say.ttl <= 0) this.say = null; } if (--this.deadTimer <= 0) { this.state = "walk"; this.lie = 0; this.targetX = null; this.stateTimer = rand(60, 140); this.speak(pick(["Am înviat! 💀→😀", "M-am întors!", "Din nou în picioare!"]), 100); } return; }
    if (this.state === "held") { this.x = pointer.x; return; }
    if (this.state === "thrown") { this.updateThrown(W); return; }
    if (this.state === "onwin") { this.updateOnWin(W); return; } // stă pe podeaua unei ferestre
    if (this.state === "ondraw") { this.updateOnDraw(W); return; } // stă pe vârful unui desen
    if (this.isPlayer) { this.playerUpdate(W); return; } // controlat de tine

    if (this.state !== "sleep" && !this.chatting) this.sleepCd--;

    if (this.say) { if (--this.say.ttl <= 0) this.say = null; }
    if (--this.chatterTimer <= 0) {
      this.chatterTimer = rand(700, 1500);
      if (this.state === "walk" || this.state === "idle") this.speak(pick(this.c.chatter), 120);
    }

    if (this.chatting) { this.state = "idle"; this.face = 1; this.jumping = false; return; }

    // salt (overlay)
    if (this.jumpCd > 0) this.jumpCd--;
    if (this.jumping) {
      this.jumpT += 1 / 34;
      this.x += this.face * (this.speed + 2.4);
      this.walkPhase += 0.2;
      if (this.jumpT >= 1) { this.jumping = false; this.jumpT = 0; this.jumpCd = 30; this.squash = 1; spawnDust(this.x, groundY, 5); }
    }

    // FOC
    if (this.burnCd > 0) this.burnCd--;
    if (this.waterAnim > 0) { this.waterAnim--; if (this.waterAnim === 0) this.speak("O iau înapoi.", 70); }
    if (this.burning) {
      if (--this.burnTimer <= 0) {
        this.burning = false; this.burnCd = 120;
        if (this.willWater) { this.waterAnim = 70; this.state = "idle"; this.targetX = null; this.speak("Apă! 🪣", 90); }
        else this.speak(pick(["Uf! Gata.", "Am scăpat!"]), 80);
      }
    } else if (this.burnCd <= 0 && this.waterAnim <= 0 && (this.state === "walk" || this.state === "run" || this.state === "idle" || this.state === "scared")) {
      for (const s of structures) {
        if (s.type === "campfire" && s.progress > 0.5 && !s.out && Math.abs(s.x - this.x) < 26) {
          s.hits = (s.hits || 0) + 1;
          if (s.hits >= 3) { // al 3-lea stinge focul cu apă; dispare după 5s
            s.out = true; s.outTimer = 300;
            this.state = "idle"; this.targetX = null; this.waterAnim = 70; this.burnCd = 120;
            this.speak("Ajunge! Apă! 🪣", 110);
          } else {
            this.burning = true; this.willWater = Math.random() < 0.25;
            this.burnTimer = this.willWater ? 120 : 300;
            this.state = "run"; this.targetX = rand(80, W - 80);
            this.speak("Arde! 🔥", 100);
          }
          break;
        }
      }
    }

    // tresărire la cursor rapid și aproape (fără să lovească)
    if (this.startle <= 0 && (this.state === "walk" || this.state === "idle")) {
      const dxm = this.x - pointer.x, dym = (groundY - 60) - pointer.y;
      const near = Math.hypot(dxm, dym) < 70;
      const fast = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py) > 24;
      if (near && fast) { this.startle = 22; this.face = dxm >= 0 ? 1 : -1; this.speak("!", 40); }
    }

    // ---- mașină de stări ----
    if (this.state === "hit") {
      this.x += this.vx; this.vx *= 0.9;
      if (--this.stateTimer <= 0) { this.state = "walk"; this.stateTimer = rand(60, 160); this.targetX = null; }
    }
    else if (this.state === "leaving") {
      const dx = this.exitX - this.x;
      this.face = dx >= 0 ? 1 : -1;
      this.x += Math.sign(dx) * (this.speed + 1.3);
      this.walkPhase += 0.18;
      if (this.x < -50 || this.x > W + 50) { this.away = true; this.awayTimer = expedition ? expedition.duration : rand(3600, 18000); }
    }
    else if (this.state === "watch") {
      if (!browserWin) { this.state = "walk"; this.targetX = null; this.stateTimer = rand(30, 90); this.watchArrived = false; }
      else {
        const dx = this.watchTarget - this.x;
        if (Math.abs(dx) > 5 && !this.watchArrived) { const step = Math.sign(dx) * this.speed * 1.7; this.face = dx >= 0 ? 1 : -1; if (!this.wouldCollide(this.x + step)) { this.x += step; this.walkPhase += 0.13; } }
        else if (!this.watchArrived) { // a ajuns: termină pasul (aduce piciorul la loc) apoi se oprește — nu îngheață brusc
          const rest = Math.round(this.walkPhase / Math.PI) * Math.PI;
          if (Math.abs(rest - this.walkPhase) > 0.14) this.walkPhase += 0.13 * (rest > this.walkPhase ? 1 : -1);
          else { this.walkPhase = rest; this.watchArrived = true; this.face = (browserWin.x + browserWin.w / 2) >= this.x ? 1 : -1; }
        }
        else { this.face = (browserWin.x + browserWin.w / 2) >= this.x ? 1 : -1; if (!this.say && Math.random() < 0.004) this.speak(pick(["Ooo!", "Haha!", "Tare!", "👀", "Încă unul!"]), 70); }
      }
    }
    else if (this.state === "scared") {
      if (--this.scaredTimer <= 0) { this.state = "walk"; this.targetX = null; this.stateTimer = rand(40, 90); this.speak(pick(["Uf...", "Gata?"]), 60); }
      else {
        if (--this.fleeTimer <= 0) { this.fleeTimer = rand(14, 28); const away = this.x < pointer.x ? -1 : 1; this.fleeDir = Math.random() < 0.75 ? away : -away; }
        const step = this.fleeDir * this.speed * 2.8;
        if (!this.wouldCollide(this.x + step)) { this.x += step; this.face = this.fleeDir; this.walkPhase += 0.24; }
        else this.fleeDir *= -1;
        if (!this.say && Math.random() < 0.03) this.speak(pick(["Aaah!", "Nu mă prinde!", "Ferește!"]), 40);
      }
    }
    else if (this.state === "build") {
      if (this.building) this.building.progress = Math.min(1, 1 - this.buildTimer / this.buildDur);
      if (--this.buildTimer <= 0) {
        if (this.building) this.building.progress = 1;
        this.building = null; this.state = "idle"; this.targetX = null; this.stateTimer = rand(60, 140);
        this.speak(pick(["Gata!", "Frumoasă!", "Casa mea! 🏠"]), 100);
      }
    }
    else if (this.state === "draw") {
      if (this.doodle) this.doodleReveal += this.doodle.totalPts / this.drawTimer;
      if (!this.doodle || this.doodleReveal >= this.doodle.totalPts) {
        if (this.doodle) { drawings.push(this.doodle); if (drawings.length > 14) drawings.shift(); }
        this.doodle = null; this.state = "idle"; this.targetX = null; this.stateTimer = rand(60, 140);
        this.speak(pick(["Gata! 🎨", "Frumos, nu?", "Tadaa!"]), 90);
      }
    }
    else if (this.state === "gopaint") {
      const cv = paintWin && paintWin._canvas;
      if (!cv) { // Paint închis → cade / renunță
        this._pd = null; this._pdTargets = null;
        if (this.tz > 0) { this.gpPhase = "fall"; }
        else { this.gpPhase = undefined; this.gpTargetX = undefined; this.state = "walk"; this.targetX = null; return; }
      }
      if (this.gpPhase === undefined) this.gpPhase = "go";
      if (this.gpPhase === "go") { // merge la un x în pânză
        if (this.gpTargetX === undefined) this.gpTargetX = clamp(rand(cv.x + 70, cv.x + cv.w - 70), 70, W - 70);
        const dx = this.gpTargetX - this.x;
        if (Math.abs(dx) < 12) { this.gpPhase = "up"; this.tz = 0; this.perchTz = clamp(groundY - (cv.y + rand(cv.h * 0.32, cv.h * 0.82)), 60, groundY - 40); }
        else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.9; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.17; }
      } else if (this.gpPhase === "up") { // se urcă în aplicație
        this.tz += (this.perchTz - this.tz) * 0.2;
        if (this.perchTz - this.tz < 4) {
          this.tz = this.perchTz;
          const handSX = this.x + this.face * 22, handSY = (groundY - this.tz) - 130;
          const size = rand(cv.w * 0.05, cv.w * 0.09);
          const lcx = clamp(handSX - cv.x, size + 4, cv.w - size - 4), lcy = clamp(handSY - cv.y, size + 4, cv.h - size - 4);
          this._pdWeapon = Math.random() < 0.55 ? (Math.random() < 0.5 ? "sword" : "bow") : null; // uneori desenează o armă
          this._pd = this._pdWeapon === "sword" ? makeSwordDoodle(lcx, lcy, size, this.c.color) : this._pdWeapon === "bow" ? makeBowDoodle(lcx, lcy, size, this.c.color) : makeDoodle(lcx, lcy, size, this.c.color);
          this._pdReveal = 0; this._pdTimer = Math.max(50, this._pd.totalPts * 1.2);
          this._pdTargets = this._pd.strokes.map(s => { const o = { color: this.c.color, w: 3, pts: [] }; paintWin.strokes.push(o); return { src: s, dst: o }; });
          this.gpPhase = "draw"; this.speak(this._pdWeapon === "bow" ? pick(["Un arc! 🏹", "Fac o armă!"]) : this._pdWeapon === "sword" ? pick(["O sabie! ⚔️", "Fac o armă!"]) : pick(["Și eu! 🎨", "Uite ce fac!", "Arta mea!"]), 90);
        }
      } else if (this.gpPhase === "draw") { // desenează perched, în pânză
        this._pdReveal += this._pd.totalPts / this._pdTimer;
        const cnt = Math.floor(this._pdReveal); let used = 0;
        for (const t of this._pdTargets) { const take = clamp(cnt - used, 0, t.src.length); t.dst.pts = t.src.slice(0, take); used += t.src.length; }
        if (cnt >= this._pd.totalPts) { if (this._pdWeapon) { this.weapon = this._pdWeapon; this._justForged = true; this._pdWeapon = null; } this._pd = null; this._pdTargets = null; this.gpPhase = "fall"; this.climbV = 0; this.speak(this.weapon ? "Gata! ⚔️" : pick(["Gata! 🎨", "Frumos!"]), 80); }
      } else { // cade jos
        this.climbV += 0.9; this.tz -= this.climbV;
        if (this.tz <= 0) {
          this.tz = 0; this.gpPhase = undefined; this.gpTargetX = undefined; this.targetX = null; this.squash = 1; spawnDust(this.x, groundY, 5);
          if (this._justForged) { this._justForged = false; this.state = "getweapon"; this._admire = 75; this._wpT = null; } // se uită la armă apoi zice
          else { this.state = "idle"; this.stateTimer = rand(60, 140); }
        }
      }
    }
    else if (this.state === "climb") { // se urcă pe un desen de pe wallpaper
      const d = this.climbT;
      if (!d || !drawings.includes(d)) { this.state = "walk"; this.climbT = null; this.tz = 0; this.targetX = null; return; }
      if (this.climbPhase === "go") {
        const dx = d.cx - this.x;
        if (Math.abs(dx) < 10) { this.climbPhase = "up"; this.tz = 0; this.hangTz = clamp(groundY - d.cy - 130, 30, groundY - 30); this.climbV = Math.sqrt(2 * 0.9 * this.hangTz); this.squash = 0.6; spawnDust(this.x, groundY, 5); } // își ia avânt și SARE spre desen
        else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.9; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.17; }
      } else if (this.climbPhase === "up") { // salt balistic până se prinde (nu tras ca la grappling hook)
        this.climbV -= 0.9; this.tz += this.climbV;
        if (this.tz >= this.hangTz || this.climbV <= 0) { this.tz = this.hangTz; this.climbPhase = "hang"; this.hangTimer = 300; this.face = d.cx >= this.x ? 1 : -1; this.speak(pick(["Sus! 🧗", "M-am agățat!"]), 70); }
      } else if (this.climbPhase === "hang") { // se ține cu o mână 5s
        if (--this.hangTimer <= 0) { this.climbPhase = "fall"; this.climbV = 0; }
        else if (!this.say && Math.random() < 0.008) this.speak(pick(["Nu privi în jos!", "Uau!", "Ajutor?"]), 70);
      } else { // cade jos
        this.climbV += 0.9; this.tz -= this.climbV;
        if (this.tz <= 0) { this.tz = 0; this.state = "walk"; this.climbT = null; this.targetX = null; this.stateTimer = rand(60, 140); this.squash = 1; spawnDust(this.x, groundY, 6); }
      }
    }
    else if (this.state === "climbwin") { // se urcă pe o fereastră de aplicație
      const w = this.climbWin, open = w && standWindows().includes(w);
      if (!open && this.climbPhase !== "fall") { // fereastra s-a închis → cade
        if (this.tz > 0) { this.climbPhase = "fall"; this.climbV = 0; }
        else { this.state = "walk"; this.climbWin = null; this.tz = 0; this.targetX = null; return; }
      }
      if (this.climbPhase === "go") {
        const dx = clamp(this.winTargetX, 60, W - 60) - this.x;
        if (Math.abs(dx) < 12) { this.climbPhase = "up"; this.tz = 0; this.hangTz = clamp(groundY - this.winGY - 130, 30, groundY - 20); }
        else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.9; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.17; }
      } else if (this.climbPhase === "up") {
        this.tz += (this.hangTz - this.tz) * 0.22;
        if (this.hangTz - this.tz < 4) { this.tz = this.hangTz; this.climbPhase = "hang"; this.hangTimer = 300; this.face = (w.x + w.w / 2 >= this.x) ? 1 : -1; this.speak(pick(["M-am agățat! 🧗", "Ce priveliște!", "Sus!"]), 80); }
      } else if (this.climbPhase === "hang") { // se ține cu o mână ~5s (ca la desene)
        if (--this.hangTimer <= 0) { this.climbPhase = "fall"; this.climbV = 0; }
        else if (!this.say && Math.random() < 0.008) this.speak(pick(["Nu privi în jos!", "Uite de sus!", "Hehe."]), 70);
      } else { // cade jos
        this.climbV += 0.9; this.tz -= this.climbV;
        if (this.tz <= 0) { this.tz = 0; this.state = "walk"; this.climbWin = null; this.targetX = null; this.stateTimer = rand(60, 140); this.squash = 1; spawnDust(this.x, groundY, 6); }
      }
    }
    else if (this.state === "onstruct") { // se urcă pe o clădire/structură
      const s = this.onStruct;
      if (!s || !structures.includes(s)) { this.onStruct = null; this.state = "walk"; this.tz = 0; this.targetX = null; return; }
      const box = structBox(s), base = s.by || groundY, top = base - box.h, lo = s.x - box.hw + 8, hi = s.x + box.hw - 8;
      if (this.osPhase === "go") {
        const dx = s.x - this.x;
        if (Math.abs(dx) < 14) { this.osPhase = "up"; this.tz = 0; this.osTargetTz = clamp(groundY - top, 20, groundY - 10); }
        else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.8; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.16; }
      } else if (this.osPhase === "up") {
        this.tz += (this.osTargetTz - this.tz) * 0.22;
        if (this.osTargetTz - this.tz < 4) { this.tz = this.osTargetTz; this.osPhase = "stand"; this.osTimer = rand(260, 520); this.osVX = 0; this.speak(pick(["Ce priveliște!", "Sus de tot!", "Regele dealului!"]), 80); }
      } else if (this.osPhase === "stand") {
        this.tz = groundY - top; // urmează clădirea dacă e trasă
        if (--this.osTimer <= 0) { this.osPhase = "fall"; this.climbV = 0; }
        else {
          if (this.osVX === 0) { if (Math.random() < 0.03) this.osVX = (Math.random() < 0.5 ? -1 : 1) * this.speed; }
          else if (Math.random() < 0.02) this.osVX = 0;
          if (this.osVX) { this.x += this.osVX; this.face = Math.sign(this.osVX); this.walkPhase += 0.13; if (this.x <= lo || this.x >= hi) this.osVX *= -1; }
          this.x = clamp(this.x, lo, hi);
        }
      } else { // cade jos
        this.climbV += 0.9; this.tz -= this.climbV;
        if (this.tz <= 0) { this.tz = 0; this.state = "walk"; this.onStruct = null; this.targetX = null; this.stateTimer = rand(60, 140); this.squash = 1; spawnDust(this.x, groundY, 6); }
      }
    }
    else if (this.state === "getweapon") { // merge la armă, o ia, se uită la ea, apoi zice
      const wp = this._wpT;
      if (this._admire === undefined) {
        if (!wp || wp.taken) { this._wpT = null; this.state = "walk"; this.targetX = null; return; }
        const dx = wp.x - this.x;
        if (Math.abs(dx) < 12) { wp.taken = true; this.weapon = wp.type; this._admire = 75; this.face = 1; }
        else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.8; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.16; }
      } else {
        if (--this._admire <= 0) { this._admire = undefined; this._wpT = null; this.state = "idle"; this.stateTimer = rand(40, 90); this.speak(this.weapon === "bow" ? pick(["Am arc! 🏹", "La țintă!", "Trag!"]) : pick(["Am sabie! ⚔️", "În gardă!", "La luptă!"]), 100); }
      }
    }
    else if (this.state === "run") {
      if (this.targetX === null) { this.state = "walk"; this.stateTimer = rand(40, 100); }
      else {
        const dx = this.targetX - this.x;
        if (Math.abs(dx) < 6) { this.targetX = null; this.state = "walk"; this.stateTimer = rand(40, 120); }
        else if (!this.jumping) {
          const step = Math.sign(dx) * this.speed * 2.6;
          this.face = dx >= 0 ? 1 : -1;
          if (!this.wouldCollide(this.x + step)) { this.x += step; this.walkPhase += 0.22; }
          else { this.targetX = clamp(this.x - Math.sign(dx) * rand(140, 280), 80, W - 80); } // blocat → schimbă ținta (se întoarce), nu rămâne blocat
        }
      }
    }
    else if (this.state === "sleep") {
      if (this.sleepPhase === "goto") { // merge spre casă înainte să se culce
        const h = this.sleepHouse;
        if (!h || !structures.includes(h)) { this.sleepPhase = "down"; this.sleepDir = Math.random() < 0.5 ? 1 : -1; } // casa a dispărut → doarme pe loc
        else {
          const dx = h.x - this.x;
          if (Math.abs(dx) < 14) { this.sleepPhase = "down"; this.sleepDir = Math.random() < 0.5 ? 1 : -1; this.speak("Zzz", 90); }
          else if (!this.jumping) { this.x += Math.sign(dx) * this.speed * 1.4; this.face = dx >= 0 ? 1 : -1; this.walkPhase += 0.14; }
        }
      }
      else if (this.sleepPhase === "down") { this.lie = Math.min(1, this.lie + 0.04); if (this.lie >= 1) { this.sleepPhase = "rest"; this.sleepTimer = 1200; } }
      else if (this.sleepPhase === "rest") { if (--this.sleepTimer <= 0) this.sleepPhase = "up"; else if (!this.say && Math.random() < 0.004) this.speak("Zzz", 110); }
      else { this.lie = Math.max(0, this.lie - 0.05); if (this.lie <= 0) { this.state = "walk"; this.targetX = null; this.stateTimer = rand(80, 180); } }
    }
    else if (this.state === "fight") {
      const o = this.opponent;
      if (!o) { this.state = "walk"; return; }
      const dx = o.x - this.x, d = Math.abs(dx) || 1;
      this.face = dx >= 0 ? 1 : -1;
      const bow = this.weapon === "bow", wantD = bow ? 210 : 60;
      if (d > wantD + 8) { this.x += Math.sign(dx) * (this.speed + 0.5); this.walkPhase += 0.16; }
      else if (d < wantD - 8 && !bow) { // corp la corp: nu se suprapun
        const s = dx !== 0 ? Math.sign(dx) : (agents.indexOf(this) < agents.indexOf(o) ? 1 : -1);
        this.x -= s * (this.speed + 0.5); this.walkPhase += 0.13;
      }
      else if (this.attacker && this.punchTimer-- <= 0) {
        this.punchTimer = rand(bow ? 45 : 30, bow ? 70 : 50);
        this.attackAnim = 16;
        if (bow) { this.attackType = "bow"; arrows.push({ x: this.x + this.face * 20, y: groundY - 96, vx: this.face * 9, foe: o, life: 160 }); }
        else {
          this.attackType = this.weapon === "sword" ? "punch" : (Math.random() < 0.5 ? "punch" : "kick");
          o.recoil = this.attackType === "kick" ? 18 : 14;
          o.stars = [{ ang: 0, r: 22 }, { ang: 2, r: 22 }, { ang: 4, r: 22 }];
          if (this.weapon === "sword" && o.state !== "dead" && Math.random() < 0.2) o.die(); // lovitură mortală de sabie
          else if (!o.say) o.speak(pick(o.c.hitLines), 45);
        }
        this.attacker = false; o.attacker = true; o.punchTimer = rand(24, 40);
      }
      if (--this.stateTimer <= 0) this.endFight();
    }
    else { // walk / idle
      if (this.startle > 0) {
        this.x += this.face * 1.4; // face un pas înapoi speriat
      } else if (this.targetX === null || this.stateTimer-- <= 0) {
        if (this.sleepCd <= 0) {
          this.sleepCd = rand(14400, 21600);
          const houses = structures.filter(s => s.type === "house" && s.progress > 0.6); // doar CASE gata (nu turn/copac/foc)
          const house = houses.length ? houses.reduce((a, b) => Math.abs(b.x - this.x) < Math.abs(a.x - this.x) ? b : a) : null;
          if (house) { // merge la culcare ÎN cea mai apropiată casă
            this.state = "sleep"; this.sleepPhase = "goto"; this.sleepHouse = house; this.lie = 0; this.targetX = null;
            this.speak(pick(["Mi-e somn... 😴", "Merg la culcare.", "La casă, la nani."]), 90);
          } else { // nicio casă → doarme pe loc (ca înainte)
            this.state = "sleep"; this.sleepPhase = "down"; this.lie = 0;
            this.sleepDir = Math.random() < 0.5 ? 1 : -1; this.speak("...", 60);
          }
        } else {
          const r = Math.random();
          const foe = this.weapon ? agents.find(o => o !== this && !o.isPlayer && !o.away && !o.opponent && (o.state === "walk" || o.state === "idle") && Math.abs(o.x - this.x) < 480) : null;
          if (this.weapon && foe && r < 0.06) { // înarmat → provoacă la luptă
            startFightBetween(this, foe);
          } else if (!this.weapon && weapons.some(s => !s.taken) && r < 0.05) { // neînarmat → ia o armă
            this._wpT = weapons.find(s => !s.taken); this.state = "getweapon"; this.targetX = null; this.speak(pick(["O armă!", "A mea!", "Hei!"]), 80);
          } else if (r < 0.012 && this.builtCount < 2 && structures.length < 8) {
            const type = pick(["house", "tower", "tree", "campfire"]);
            this.state = "build"; this.buildDur = rand(340, 480); this.buildTimer = this.buildDur;
            const s = { x: this.x, color: this.c.color, progress: 0, type }; structures.push(s); this.building = s; this.builtCount++;
            const m = { house: ["Construiesc!", "O casă!"], tower: ["Un turn!", "Sus!"], tree: ["Un copac!", "Verde!"], campfire: ["Un foc!", "Cald!"] };
            this.speak(pick(m[type]), 120);
          } else if (paintWin && r < 0.03) {
            this._pd = null; this._pdTargets = null; this.gpPhase = undefined; this.gpTargetX = undefined; this.state = "gopaint"; this.targetX = null;
            this.speak(pick(["La Paint!", "Mă urc să desenez!", "Și eu vreau!"]), 90);
          } else if (drawings.length && r < 0.045) {
            this.climbT = pick(drawings); this.climbPhase = "go"; this.state = "climb"; this.targetX = null;
            this.speak(pick(["Mă urc pe desen! 🧗", "Sus pe el!", "Cățărare!"]), 90);
          } else if (standWindows().length && r < 0.065) {
            const w = pick(standWindows()), edge = pick(["top", "left", "right"]);
            let gx, gy;
            if (edge === "top") { gx = rand(w.x + 20, w.x + w.w - 20); gy = w.y; }
            else if (edge === "left") { gx = w.x; gy = rand(w.y + 20, w.y + w.h * 0.7); }
            else { gx = w.x + w.w; gy = rand(w.y + 20, w.y + w.h * 0.7); }
            this.climbWin = w; this.climbPhase = "go"; this.state = "climbwin"; this.targetX = null;
            this.winTargetX = clamp(gx, 60, W - 60); this.winGY = gy;
            this.speak(pick(["Mă urc pe ecran! 🧗", "La fereastră!", "Sus pe ea!"]), 90);
          } else if (structures.length && r < 0.085) {
            this.onStruct = pick(structures); this.osPhase = "go"; this.state = "onstruct"; this.targetX = null;
            this.speak(pick(["Mă urc pe clădire! 🧗", "Sus pe casă!", "La înălțime!"]), 90);
          } else if (r < 0.105) {
            const cx = clamp(this.x + rand(-40, 40), 90, W - 90);
            const cy = rand(90, Math.max(130, groundY - 190));
            this.doodle = makeDoodle(cx, cy, rand(30, 48), this.c.color);
            this.face = cx >= this.x ? 1 : -1;
            this.state = "draw"; this.doodleReveal = 0; this.drawTimer = Math.max(70, this.doodle.totalPts * 2);
            this.speak(pick(["Desenez! 🎨", "Artă!", "O capodoperă!", "Uite ce fac!"]), 110);
          } else if (r < 0.22) { this.state = "run"; this.targetX = rand(80, W - 80); this.stateTimer = rand(120, 260); this.speak(pick(["Aici!", "Repede!", "Hop!"]), 60); }
          else if (r < 0.45) { this.state = "idle"; this.targetX = null; this.stateTimer = rand(60, 140); }
          else { this.state = "walk"; this.targetX = rand(80, W - 80); this.stateTimer = rand(120, 300); }
        }
      }
      if (this.state === "walk" && this.targetX !== null && !this.jumping && this.startle <= 0) {
        const dx = this.targetX - this.x;
        if (Math.abs(dx) < 4) this.targetX = null;
        else {
          const step = Math.sign(dx) * this.speed;
          this.face = dx >= 0 ? 1 : -1;
          if (!this.wouldCollide(this.x + step)) { this.x += step; this.walkPhase += 0.115; }
          else { this.targetX = clamp(this.x - Math.sign(dx) * rand(140, 280), 80, W - 80); this.stateTimer = rand(120, 300); } // blocat de altcineva → se întoarce spre altă țintă, nu rămâne înțepenit
        }
      }
    }

    // (dezactivat) nu mai sar unul peste altul — saltul rămâne doar pentru jucător (spacebar)

    // salut la trecere
    if (this.greetCd <= 0 && (this.state === "walk")) {
      for (const o of agents) {
        if (o === this || o.away || o.state === "sleep" || o.state === "fight" || o.state === "thrown" || o.state === "held") continue;
        if (Math.abs(o.x - this.x) < 74 && Math.abs(o.x - this.x) > 40 && Math.random() < 0.02) {
          this.waveTimer = 45; this.greetCd = 400; o.greetCd = 300;
          this.speak(pick(["Salut!", "Hei!", "Ce faci?"]), 70); break;
        }
      }
    }

    if (this.state !== "leaving") this.x = clamp(this.x, 60, W - 60);
  }

  playerUpdate(W) {
    if (this.jumpCd > 0) this.jumpCd--;
    if (this.say) { if (--this.say.ttl <= 0) this.say = null; }
    // foc
    if (this.burnCd > 0) this.burnCd--;
    if (this.waterAnim > 0) this.waterAnim--;
    if (this.burning) { if (--this.burnTimer <= 0) { this.burning = false; this.burnCd = 120; } }
    else if (this.burnCd <= 0) { for (const s of structures) if (s.type === "campfire" && s.progress > 0.5 && !s.out && Math.abs(s.x - this.x) < 26) { this.burning = true; this.burnTimer = 300; break; } }
    // salt
    if (this.jumping) {
      this.jumpT += 1 / 34;
      this.x += this.face * (this.speed + 1.6);
      this.walkPhase += 0.16;
      if (this.jumpT >= 1) { this.jumping = false; this.jumpT = 0; this.jumpCd = 20; this.squash = 1; spawnDust(this.x, groundY, 5); }
    } else {
      let dir = 0;
      if (keys.has("a") || keys.has("arrowleft")) dir -= 1;
      if (keys.has("d") || keys.has("arrowright")) dir += 1;
      if (dir) { this.face = dir; const step = dir * this.speed * 2.4; if (!this.wouldCollide(this.x + step)) this.x += step; this.walkPhase += 0.16; this.state = "run"; }
      else this.state = "idle";
    }
    this.x = clamp(this.x, 60, W - 60);
  }

  updateThrown(W) {
    this.tvx *= 0.992;
    this.tzv += 0.85; // gravitație
    this.x += this.tvx;
    this.tz -= this.tzv;
    this.tangle += this.tangVel;
    if (this.x < 40 || this.x > W - 40) { this.tvx *= -0.5; this.x = clamp(this.x, 40, W - 40); }
    // aterizează pe partea de sus a ferestrei spre care a fost aruncat
    const lw = this.landWin;
    if (lw && this.tzv > 0 && standWindows().includes(lw) && this.x >= lw.x && this.x <= lw.x + lw.w && this.tz <= groundY - lw.y) {
      this.landWin = null; this.tangle = 0; this.tangVel = 0; this.squash = 1;
      this.stayOnWindow(lw, this.x, lw.y); // aterizează și stă pe ea
      return;
    }
    // aterizează pe partea de sus a unei clădiri
    const ls = this.landStruct;
    if (ls && this.tzv > 0 && structures.includes(ls)) {
      const b = structBox(ls), base = ls.by || groundY, top = base - b.h;
      if (this.x >= ls.x - b.hw && this.x <= ls.x + b.hw && this.tz <= groundY - top) {
        this.landStruct = null; this.tangle = 0; this.tangVel = 0; this.squash = 1;
        this.state = "onstruct"; this.onStruct = ls; this.osPhase = "stand"; this.osTimer = 100000; this.osVX = 0;
        this.tz = groundY - top; this.x = clamp(this.x, ls.x - b.hw + 8, ls.x + b.hw - 8);
        this.speak(pick(["Aici stau!", "Sus rămân!"]), 80);
        return;
      }
    }
    // aterizează pe partea de sus a unui desen (coliziune ca la ferestre)
    const ld = this.landDrawing;
    if (ld && this.tzv > 0 && drawings.includes(ld)) {
      const top = ld.cy - ld.s, hw = ld.s * 1.6; // raza de aterizare = cutia de drop (dropTarget)
      if (this.x >= ld.cx - hw && this.x <= ld.cx + hw && this.tz <= groundY - top) {
        this.landDrawing = null; this.tangle = 0; this.tangVel = 0; this.squash = 1;
        this.landOnDrawing(ld);
        return;
      }
    }
    if (this.tz <= 0) {
      this.landWin = null; this.landStruct = null; this.landDrawing = null;
      this.tz = 0;
      if (this.tzv > 5 && this.bounces < 2) {
        this.bounces++;
        this.tzv = -this.tzv * 0.45; this.tvx *= 0.6; this.tangVel *= 0.6;
        spawnDust(this.x, groundY, 6);
      } else {
        this.squash = 1.4; spawnDust(this.x, groundY, 8);
        this.tangle = 0; this.tangVel = 0;
        this.enterScared(); // se sperie și fuge de tine ~3s
      }
    }
  }

  // ---------- DESEN ----------
  draw(ctx) {
    if (this.away) return;
    const c = this.c;

    // origine + transformări în funcție de stare
    ctx.save();
    let scaleX = this.face, scaleY = 1;
    if (this.state === "held") {
      ctx.translate(pointer.x, this.heldY);
    } else if (this.state === "thrown") {
      ctx.translate(this.x, groundY - this.tz);
      ctx.rotate(this.tangle);
    } else if (this.state === "climb" || this.state === "climbwin" || this.state === "onwin" || this.state === "onstruct" || this.state === "ondraw" || (this.state === "gopaint" && this.tz > 0)) {
      ctx.translate(Math.round(this.x), Math.round(groundY - this.tz));
      if (this.squash > 0.02) { scaleY *= 1 - this.squash * 0.28; scaleX *= 1 + this.squash * 0.24; }
    } else {
      const jumpY = this.jumping ? Math.sin(this.jumpT * Math.PI) * 155 : 0;
      ctx.translate(Math.round(this.x - (this.recoil || 0) * this.face), Math.round(groundY) - jumpY);
      if (this.lie > 0) ctx.rotate(this.lie * (Math.PI / 2) * this.sleepDir);
      // squash & stretch
      if (this.jumping) { const s = Math.sin(this.jumpT * Math.PI); scaleY = 1 + s * 0.12; scaleX *= 1 - s * 0.06; }
      if (this.squash > 0.02) { scaleY *= 1 - this.squash * 0.28; scaleX *= 1 + this.squash * 0.24; }
    }
    ctx.scale(scaleX, scaleY);

    ctx.strokeStyle = c.color; ctx.fillStyle = c.color;
    ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";

    this.drawSkeleton(ctx);

    ctx.restore();

    // stele, flăcări, apă, mesaj — în spațiul ecranului
    this.drawFx(ctx);
  }

  drawSkeleton(ctx) {
    const c = this.c, st = this.state;
    const gpClimb = st === "gopaint" && (this.gpPhase === "up" || this.gpPhase === "fall");
    const winClimbMove = st === "climbwin" && (this.climbPhase === "up" || this.climbPhase === "fall");
    const winClimbHang = st === "climbwin" && this.climbPhase === "hang";
    const structMove = st === "onstruct" && (this.osPhase === "up" || this.osPhase === "fall");
    const climbMove = st === "climb" && this.climbPhase !== "go"; // în faza "go" merge normal spre desen (nu ține mâinile sus tot drumul)
    const hanging = climbMove || gpClimb || winClimbMove || winClimbHang || structMove;
    const painting = (st === "draw") || (st === "gopaint" && this.gpPhase === "draw");
    const walking = (st === "walk" || st === "run" || st === "fight" || st === "leaving" || st === "scared" || (st === "watch" && !this.watchArrived) || (st === "gopaint" && this.gpPhase === "go") || (st === "climb" && this.climbPhase === "go") || (st === "climbwin" && this.climbPhase === "go") || (st === "sleep" && this.sleepPhase === "goto") || (st === "onwin" && this.onWinVX) || (st === "ondraw" && this.onDrawVX) || (st === "getweapon" && this._admire === undefined) || (st === "onstruct" && this.osPhase === "go") || (st === "onstruct" && this.osPhase === "stand" && this.osVX));
    const running = (st === "run" || st === "leaving" || st === "scared");
    const breathe = Math.sin(this.bob) * 1.5;
    const bodyBob = walking ? Math.sin(this.walkPhase * 2) * 2 : breathe;
    const lean = running ? 7 : (this.startle > 0 ? -5 : 0);
    const hipY = HIP_Y + bodyBob;
    const shX = lean, shY = SHOULDER_Y + bodyBob, asY = shY + 4;
    const headR = c.headR, headX = lean * 1.2, headY = shY - NECK - headR;
    const striking = st === "fight" && this.attackAnim > 0;
    const HANG = 32;

    // ===== PICIOARE =====
    if (st === "held") {
      const sway = Math.sin(this.bob * 2) * 5;
      this.legIK(ctx, -3, hipY, -8 + sway, hipY + 46, -1);
      this.legIK(ctx, 3, hipY, 10 + sway, hipY + 46, -1);
    } else if (st === "thrown") {
      const sp = Math.sin(this.tangle * 2) * 10;
      this.legIK(ctx, -3, hipY, -20 + sp, hipY + 40, -1);
      this.legIK(ctx, 3, hipY, 22 + sp, hipY + 40, -1);
    } else if (this.jumping) {
      for (const side of [-1, 1]) { const hx = side * 3; ctx.beginPath(); ctx.moveTo(hx, hipY); ctx.lineTo(hx + side * 12, hipY + 14); ctx.lineTo(hx + side * 4, hipY - 2); ctx.stroke(); }
    } else if (striking && this.attackType === "kick") {
      this.legIK(ctx, -4, hipY, -8, 0, -1);
      ctx.beginPath(); ctx.moveTo(4, hipY); ctx.lineTo(26, hipY + 2); ctx.lineTo(52, hipY - 8); ctx.stroke();
    } else if (hanging) {
      const sway = Math.sin(this.bob * 2) * 6;
      this.legIK(ctx, -3, hipY, -6 + sway, hipY + 48, -1);
      this.legIK(ctx, 3, hipY, 9 + sway, hipY + 48, -1);
    } else if ((st === "sleep" && this.sleepPhase !== "goto") || st === "build" || st === "idle" || painting || (st === "watch" && this.watchArrived) || (st === "onwin" && !this.onWinVX) || (st === "ondraw" && !this.onDrawVX) || (st === "getweapon" && this._admire !== undefined) || (st === "onstruct" && this.osPhase === "stand" && !this.osVX)) {
      this.legIK(ctx, -4, hipY, -6, 0, -1);
      this.legIK(ctx, 4, hipY, 6, 0, -1);
    } else {
      const stride = running ? 22 : 15, liftH = running ? 24 : 14;
      for (const side of [-1, 1]) {
        const p = this.walkPhase + (side < 0 ? 0 : Math.PI);
        const footX = side * 4 + Math.sin(p) * stride;
        const footY = -Math.max(0, Math.cos(p)) * liftH;
        this.legIK(ctx, side * 3, hipY, footX, footY, -1);
      }
    }

    // ===== CORP =====
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(shX, shY); ctx.stroke();

    // ===== BRAȚE ===== (cinematică directă — stau pe lateral, nu trec prin corp)
    const seg = (ex, ey, hx, hy) => { ctx.beginPath(); ctx.moveTo(shX, asY); ctx.lineTo(shX + ex, asY + ey); ctx.lineTo(shX + hx, asY + hy); ctx.stroke(); };
    if (st === "held") {
      const s = Math.sin(this.bob * 2) * 5;
      seg(-8 + s, 16, -12 + s, 32); seg(8 - s, 16, 12 - s, 32);
    } else if (st === "thrown") {
      const s = Math.sin(this.tangle * 2) * 10;
      seg(-18 + s, 6, -32 + s, -2); seg(18 + s, 6, 32 + s, -2);
    } else if (this.jumping) {
      seg(14, -12, 24, -26); seg(-14, -12, -24, -26);
    } else if (this.waveTimer > 0) {
      const w = Math.sin(this.waveTimer * 0.6) * 8;
      seg(14 + w, -14, 20 + w, -30); seg(-12, 16, -18, 30);
    } else if (st === "build") {
      const hm = Math.sin(this.bob * 5) * 12;
      seg(14, -8 + hm, 22, -22 + hm); seg(-14, -6 - hm, -22, -18 - hm);
    } else if ((st === "climb" || st === "climbwin") && this.climbPhase === "hang") {
      const sway = Math.sin(this.bob * 2) * 4; // o mână ține sus, una atârnă
      seg(6, -22, 8, -42); seg(-8 + sway, 16, -12 + sway, 30);
    } else if (hanging) {
      const w = Math.sin(this.bob * 3) * 4; // ambele mâini sus (urcă / cade)
      seg(10 + w, -20, 14 + w, -40); seg(-10 - w, -20, -14 - w, -40);
    } else if (painting) {
      const w = Math.sin(this.bob * 6) * 5; // mâna se mișcă (desenează)
      seg(16 + w, -18, 28 + w, -30 + w); seg(-10, 14, -14, 26);
    } else if (striking && this.attackType === "punch") {
      seg(22, -2, 42, -6); seg(-10, 12, -6, -2);
    } else if (st === "fight") {
      seg(12, 8, 20, -6); seg(-10, 10, -4, -4);
    } else if (st === "sleep" && this.sleepPhase !== "goto") {
      seg(-12, 12, -18, 24); seg(12, 12, 18, 24);
    } else {
      const amt = running ? 0.85 : (walking ? 0.55 : 0.12);
      for (const side of [-1, 1]) {
        const p = this.walkPhase + (side < 0 ? Math.PI : 0);
        const ang = Math.sin(p) * amt;
        const ex = Math.sin(ang) * UPPER, ey = Math.cos(ang) * UPPER;
        const fa = ang + 0.35;
        seg(ex, ey, ex + Math.sin(fa) * FORE, ey + Math.cos(fa) * FORE);
      }
    }

    // ===== CAP ===== (fără față)
    ctx.beginPath(); ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    if (c.hollowHead) ctx.stroke(); else ctx.fill();

    // coroană (regele portocaliu)
    if (c.crown) {
      const cw = headR * 1.4, ch = headR * 0.7, ty = headY - headR + 2;
      ctx.save();
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#b7860b"; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(headX - cw / 2, ty);
      ctx.lineTo(headX - cw / 2, ty - ch * 0.5);
      ctx.lineTo(headX - cw / 4, ty - ch * 0.15);
      ctx.lineTo(headX, ty - ch);
      ctx.lineTo(headX + cw / 4, ty - ch * 0.15);
      ctx.lineTo(headX + cw / 2, ty - ch * 0.5);
      ctx.lineTo(headX + cw / 2, ty);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // ===== ARMĂ în mână =====
    if (this.weapon) {
      const admiring = st === "getweapon" && this._admire !== undefined;
      ctx.save();
      if (admiring) { ctx.translate(shX + 12, shY + 10); ctx.rotate(-0.6 + Math.sin(this.bob * 3) * 0.12); } // ține în față, se uită la ea
      else if (striking) { ctx.translate(shX + 34, asY - 6); ctx.rotate(this.weapon === "bow" ? 0 : -1.05); }
      else if (st === "fight") { ctx.translate(shX + 16, asY - 2); ctx.rotate(this.weapon === "bow" ? 0 : -0.6); }
      else { ctx.translate(shX + 12, asY + 14); ctx.rotate(0.35); }
      if (this.weapon === "bow") {
        ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, 0, 20, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
        ctx.strokeStyle = "#d8d8d8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(striking ? -6 : 0, 0); ctx.lineTo(0, 20); ctx.stroke();
      } else {
        ctx.strokeStyle = "#dfe6f2"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -36); ctx.stroke();
        ctx.strokeStyle = "#c8963c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  legIK(ctx, hipX, hipY, footX, footY, bend) {
    const k = solveIK(hipX, hipY, footX, footY, THIGH, SHIN, bend);
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(k.x, k.y); ctx.lineTo(footX, footY); ctx.stroke();
  }

  drawFx(ctx) {
    // picioarele urmează elevația (urcat pe clădiri/ferestre/desene, aruncat, ținut, salt) — la fel ca la corp în draw()
    let feetY = Math.round(groundY);
    if (this.state === "held") feetY = Math.round(this.heldY);
    else if (this.state === "thrown" || this.state === "climb" || this.state === "climbwin" || this.state === "onwin" || this.state === "onstruct" || this.state === "ondraw" || (this.state === "gopaint" && this.tz > 0)) feetY = Math.round(groundY - this.tz);
    else if (this.jumping) feetY = Math.round(groundY - Math.sin(this.jumpT * Math.PI) * 155);
    const x = Math.round(this.x);
    const headTopScreen = feetY - 150;

    // marcaj „TU" deasupra jucătorului controlat (ca să-l recunoști printre clone)
    if (this.isPlayer) {
      const my = feetY - 172 + Math.sin(frame * 0.12) * 4;
      ctx.save();
      ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.font = "bold 14px 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.strokeText("TU", x, my); ctx.fillText("TU", x, my);
      ctx.beginPath(); ctx.moveTo(x - 7, my + 6); ctx.lineTo(x + 7, my + 6); ctx.lineTo(x, my + 15); ctx.closePath();
      ctx.stroke(); ctx.fill();
      ctx.restore();
    }

    // stele
    if (this.stars.length && this.recoil > 1) {
      ctx.save(); ctx.fillStyle = "#ffd23f";
      const cy = feetY - 96 - this.c.headR;
      this.stars.forEach(s => star(ctx, x + Math.cos(s.ang) * s.r, cy + Math.sin(s.ang) * s.r * 0.6, 6));
      ctx.restore();
    }
    // flăcări
    if (this.burning) {
      ctx.save();
      const cols = ["#ff6a12", "#ff9a2e", "#ffd23f"];
      for (let i = 0; i < 6; i++) {
        const fx = x + (i - 2.5) * 8;
        const fbase = feetY - (i % 2 ? 76 : 52);
        const fh = 22 + Math.sin(frame * 0.5 + i * 1.3) * 10;
        ctx.fillStyle = cols[i % 3];
        ctx.beginPath(); ctx.moveTo(fx - 6, fbase); ctx.quadraticCurveTo(fx, fbase - fh, fx + 6, fbase); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // găleată + apă
    if (this.waterAnim > 0) {
      ctx.save();
      const bx = x + 22;
      ctx.strokeStyle = "#aeb4d0"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx - 9, feetY - 22); ctx.lineTo(bx - 7, feetY - 6); ctx.lineTo(bx + 7, feetY - 6); ctx.lineTo(bx + 9, feetY - 22); ctx.stroke();
      ctx.globalAlpha = Math.min(1, this.waterAnim / 45);
      ctx.fillStyle = "#3b7dd8";
      ctx.beginPath(); ctx.ellipse(x, feetY - 3, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.restore();
    }
    // mesaj — deasupra capului în orice stare
    if (this.say) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.say.ttl / 35);
      ctx.font = "600 16px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
      ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.6)"; // contur închis subțire (lizibil, nu se face pată)
      ctx.fillStyle = this.c.color;
      const topOff = 118 + 2 * this.c.headR;
      let sx = x, sy = feetY - topOff;
      if (this.lie > 0) sy = feetY - 55;
      if (this.state === "held") { sx = pointer.x; sy = Math.min(this.heldY, groundY) - topOff; }
      const lines = wrapText(this.say.text, 28), lh = 19;
      const startY = sy - (lines.length - 1) * lh;
      lines.forEach((ln, i) => { const yy = startY + i * lh; ctx.strokeText(ln, sx, yy); ctx.fillText(ln, sx, yy); });
      ctx.restore();
    }

    // marcaj mort (💀) — reînvie după câteva secunde
    if (this.state === "dead") {
      ctx.save(); ctx.font = "22px serif"; ctx.textAlign = "center";
      ctx.globalAlpha = Math.min(1, this.deadTimer / 30);
      ctx.fillText("💀", x, feetY - 40 + Math.sin(frame * 0.1) * 2);
      ctx.restore();
    }
    // marcaj provocator (selectat prin dublu-click)
    if (challenger === this && this.state !== "held") {
      ctx.save();
      ctx.font = "20px serif"; ctx.textAlign = "center";
      ctx.fillText("⚔️", x, feetY - (128 + 2 * this.c.headR) + Math.sin(frame * 0.15) * 3);
      ctx.restore();
    }
    // marcaj jucător (controlat de tine)
    if (this.isPlayer) {
      ctx.save(); ctx.fillStyle = "#7ee6a0"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("▼", x, feetY - (140 + 2 * this.c.headR) + Math.sin(frame * 0.15) * 2);
      ctx.restore();
    }
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2, a2 = a + Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a2) * r * 0.45, y + Math.sin(a2) * r * 0.45);
  }
  ctx.closePath(); ctx.fill();
}

// ---------- Scenă ----------
// ===== RENDER: desen pe canvas 2D offscreen → compus prin WebGL (GPU + shader) =====
// Fallback automat la 2D pur dacă WebGL nu e disponibil. Emoji/text rămân intacte.
const canvas = document.getElementById("scene");
let ctx, gfx = null, gl = null, glState = null, fxLevel = 0; // 0 = passthrough curat (fără sharpen pe text)
function glSupported() { try { return !!document.createElement("canvas").getContext("webgl"); } catch (e) { return false; } }
(function initRenderer() {
  if (glSupported()) {
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false }); } catch (e) { gl = null; }
  }
  if (gl) { gfx = document.createElement("canvas"); ctx = gfx.getContext("2d"); glState = initGL(gl); }
  if (!gl || !glState) { gl = null; glState = null; gfx = null; ctx = canvas.getContext("2d"); } // 2D pur
})();
// expuse pentru inspecție/feedback (ex. Playwright)
window.setFx = (v) => { fxLevel = v; };
window.getRenderInfo = () => ({ webgl: !!gl, fx: fxLevel });
window.getMinecraft = () => minecraftWin;
window.weapons = weapons; window.arrows = arrows; window.structures = structures;
let W = 0, H = 0, agents = [];
let fightCheck = 300;
let frame = 0;
let adventureCd = rand(1800, 4200);
let autoAdventure = false;  // expedițiile automate sunt OPRITE implicit (toggle din panou)
let chromeAutoCd = rand(2400, 5400); // ei deschid Chrome singuri din când în când
let expedition = null;      // {place, activity}
let showHitboxes = false;
let taskIcons = [];         // iconițele din taskbar (pt. click)
let browserWin = null;      // fereastra Chrome deschisă
let stopwatchWin = null;    // fereastra cronometru
let notepadWin = null;      // fereastra notepad
let paintWin = null;        // fereastra MS Paint
let minecraftWin = null;    // modul Minecraft 2D
const PAINT_COLORS = ["#ffffff", "#E63329", "#FF8C1A", "#F5C518", "#46B84B", "#3B7DD8", "#9b4dff", "#111114"];
const VIDEOS = [
  { t: "Cea mai tare cascadorie 😱", v: "stunt" },
  { t: "10 lucruri pe care nu le știai", v: "facts" },
  { t: "Pisici amuzante compilație 🐱", v: "cat" },
  { t: "Cum să construiești în Minecraft ⛏️", v: "build" },
  { t: "Cel mai bun montaj LoL 🎮", v: "fight" },
  { t: "Stick figure fights! 🔥", v: "fight" },
  { t: "Muzică chill pentru relaxat 🎧", v: "music" },
  { t: "Speedrun record mondial", v: "run" },
  { t: "Tutorial redstone avansat", v: "redstone" },
  { t: "REACȚIE la videoul ăsta 😮", v: "reaction" },
  { t: "Top 5 momente epice", v: "countdown" },
  { t: "El a construit ASTA în 24h", v: "build" },
];
const pointer = { x: -999, y: -999, px: -999, py: -999, down: false, downX: 0, downY: 0, cand: null, grabbed: null, moved: 0 };
let challenger = null;                        // primul ales prin dublu-click
let lastClick = { agent: null, time: 0 };     // pt. detectarea dublu-click-ului
let player = null, playerCount = 0;           // stickman controlat de tine (tasta R)
const keys = new Set();                        // taste apăsate (A/D/săgeți)

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  const pxW = Math.round(W * dpr), pxH = Math.round(H * dpr);
  canvas.width = pxW; canvas.height = pxH;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  if (gl) { gfx.width = pxW; gfx.height = pxH; gl.viewport(0, 0, pxW, pxH); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = Math.max(180, H - 90);
}
// ---- WebGL: compilează programul de compunere + quad + textură ----
function initGL(g) {
  const vs = "attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.,1.); }";
  const fs = [
    "precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_fx;",
    "void main(){",
    "  vec3 c = texture2D(u_tex, v_uv).rgb;",
    "  vec3 blur = (texture2D(u_tex, v_uv+vec2(u_texel.x,0.)).rgb + texture2D(u_tex, v_uv-vec2(u_texel.x,0.)).rgb + texture2D(u_tex, v_uv+vec2(0.,u_texel.y)).rgb + texture2D(u_tex, v_uv-vec2(0.,u_texel.y)).rgb)*0.25;",
    "  c += (c-blur)*(0.28*u_fx);",                    // sharpen (blând, ca să nu îngroașe textul)
    "  vec2 d = v_uv-0.5; c *= 1.0 - dot(d,d)*(0.4*u_fx);", // vignette
    "  gl_FragColor = vec4(c,1.0);",
    "}"
  ].join("\n");
  const compile = (type, src) => { const sh = g.createShader(type); g.shaderSource(sh, src); g.compileShader(sh); if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) { console.warn("GL shader:", g.getShaderInfoLog(sh)); } return sh; };
  const prog = g.createProgram();
  g.attachShader(prog, compile(g.VERTEX_SHADER, vs)); g.attachShader(prog, compile(g.FRAGMENT_SHADER, fs)); g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) { console.warn("GL link:", g.getProgramInfoLog(prog)); return null; }
  const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const tex = g.createTexture(); g.bindTexture(g.TEXTURE_2D, tex);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST); // 1:1 crisp, fără înmuiere
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
  return { prog, buf, tex, aPos: g.getAttribLocation(prog, "a_pos"), uTex: g.getUniformLocation(prog, "u_tex"), uTexel: g.getUniformLocation(prog, "u_texel"), uFx: g.getUniformLocation(prog, "u_fx") };
}
// ---- WebGL: urcă cadrul offscreen ca textură și îl desenează cu shaderul ----
function presentGL() {
  if (!gl || !glState) return;
  const s = glState;
  gl.bindTexture(gl.TEXTURE_2D, s.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gfx);
  gl.useProgram(s.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
  gl.enableVertexAttribArray(s.aPos); gl.vertexAttribPointer(s.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(s.uTex, 0);
  gl.uniform2f(s.uTexel, 1 / gfx.width, 1 / gfx.height);
  gl.uniform1f(s.uFx, fxLevel);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function initAgents() { agents = CHARACTERS.map(c => new Agent(c, W)); }

function nearestAgent(cx, cy) {
  let best = null, bestD = 1e9;
  for (const a of agents) {
    if (a.away) continue;
    let feetY = groundY;
    if (a.state === "climb" || a.state === "climbwin" || a.state === "onwin" || a.state === "onstruct" || a.state === "ondraw" || a.state === "thrown" || (a.state === "gopaint" && a.tz > 0)) feetY = groundY - a.tz;
    else if (a.jumping) feetY = groundY - Math.sin(a.jumpT * Math.PI) * 155;
    // punctele tors/cap; când e aruncat se rotesc cu modelul (aceeași rotație ca tangle)
    const ang = a.state === "thrown" ? a.tangle : 0, si = Math.sin(ang), co = Math.cos(ang);
    const tX = a.x + 70 * si, tY = feetY - 70 * co;                        // tors
    const hL = 100 + a.c.headR, hX = a.x + hL * si, hY = feetY - hL * co;  // cap
    const d = Math.min(Math.hypot(tX - cx, tY - cy), Math.hypot(hX - cx, hY - cy));
    if (d < bestD) { bestD = d; best = a; }
  }
  return (best && bestD < 90) ? best : null;
}

// ---- interacțiune: click = lovitură, ține & trage = apucă și aruncă, dreapta = chat ----
window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  pointer.down = true; pointer.downX = e.clientX; pointer.downY = e.clientY; pointer.moved = 0;
  if (minecraftWin) {
    const m = minecraftWin;
    if (e.clientX >= m.x && e.clientX <= m.x + m.w && e.clientY >= m.y && e.clientY <= m.y + m.h) { // doar în fereastra Minecraft
      if (m._xb && e.clientX >= m._xb.x && e.clientX <= m._xb.x + m._xb.s && e.clientY >= m._xb.y && e.clientY <= m._xb.y + m._xb.s) { closeMinecraft(); return; } // butonul X
      if (e.clientX >= m.x + m.w - 22 && e.clientY >= m.y + m.h - 22) { pointer.resizeMc = { ox: e.clientX, t0: m.tile }; return; } // scalare
      if (e.clientX <= m.x + m.w - 30 && e.clientY <= m.y + 26) { pointer.dragMc = { ox: e.clientX - m.x, oy: e.clientY - m.y }; return; } // mută
      pointer.mcBreaking = true; mcBreakAt(e.clientX, e.clientY); return; // spargi blocuri
    }
    // în afara Minecraft → interacțiune normală cu desktopul
  }
  // redimensionare din colțul dreapta-jos
  const rw = resizeHandleAt(e.clientX, e.clientY);
  if (rw) { pointer.resizeWin = { win: rw, ox: e.clientX, oy: e.clientY, w0: rw.w, h0: rw.h }; return; }
  // drag pe bara de titlu → muți fereastra
  const tw = titleBarAt(e.clientX, e.clientY);
  if (tw) { pointer.dragWin = { win: tw, ox: e.clientX - tw.x, oy: e.clientY - tw.y }; return; }
  // Paint: dacă apeși în fereastra Paint nu apuci stickmanii din spate
  if (paintWin && e.clientX >= paintWin.x && e.clientX <= paintWin.x + paintWin.w && e.clientY >= paintWin.y && e.clientY <= paintWin.y + paintWin.h) {
    const c = paintWin._canvas;
    if (c && e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h) {
      pointer.paint = true;
      paintWin.cur = { color: paintWin.color, w: 3, pts: [{ x: e.clientX - c.x, y: e.clientY - c.y }] };
    }
    return;
  }
  pointer.cand = nearestAgent(e.clientX, e.clientY);
  if (!pointer.cand) { const st = structureAt(e.clientX, e.clientY); if (st) pointer.dragStruct = { s: st, ox: e.clientX - st.x, oy: e.clientY - (st.by || groundY) }; } // apucă o casă/structură
});
window.addEventListener("mousemove", (e) => {
  pointer.px = pointer.x; pointer.py = pointer.y; pointer.x = e.clientX; pointer.y = e.clientY;
  if (pointer.resizeWin) {
    const r = pointer.resizeWin, w = r.win, ar = r.w0 / r.h0;
    // scalare uniformă (păstrează proporțiile) — doar mărimea se schimbă, nu forma
    let nw = clamp(r.w0 + (pointer.x - r.ox), 170, W - w.x - 8), nh = nw / ar;
    const maxH = groundY - w.y - 8;
    if (nh > maxH) { nh = maxH; nw = nh * ar; }
    if (nh < 130) { nh = 130; nw = nh * ar; }
    w.w = nw; w.h = nh;
    return;
  }
  if (pointer.dragWin) {
    const d = pointer.dragWin, w = d.win;
    const nx = clamp(pointer.x - d.ox, -w.w + 80, W - 80), ny = clamp(pointer.y - d.oy, 24, groundY - 60);
    const ddx = nx - w.x, ddy = ny - w.y; w.x = nx; w.y = ny;
    // stickmanii agățați / pe podeaua ei zboară cu fereastra
    for (const a of agents) {
      if (a.state === "climbwin" && a.climbWin === w) { a.x += ddx; a.tz -= ddy; a.hangTz -= ddy; }
      else if (a.state === "onwin" && a.onWin === w) { a.x += ddx; } // tz se recalculează din fereastră
    }
    return;
  }
  if (pointer.resizeMc) { // scalare uniformă Minecraft (mărimea blocurilor)
    const m = minecraftWin, nt = clamp(pointer.resizeMc.t0 + (pointer.x - pointer.resizeMc.ox) / m.cols, 12, 46), ratio = nt / m.tile;
    m.tile = nt; m.w = m.cols * nt; m.h = m.rows * nt;
    for (const mob of m.mobs) { mob.px *= ratio; mob.py *= ratio; mob.vy *= ratio; }
    return;
  }
  if (pointer.dragStruct) { const d = pointer.dragStruct, nx = clamp(pointer.x - d.ox, 40, W - 40), ddx = nx - d.s.x; d.s.x = nx; d.s.by = clamp(pointer.y - d.oy, 120, groundY); for (const a of agents) if (a.state === "onstruct" && a.onStruct === d.s) a.x += ddx; return; }
  if (pointer.dragMc) {
    const m = minecraftWin;
    const nx = clamp(pointer.x - pointer.dragMc.ox, -m.w + 120, W - 120), ny = clamp(pointer.y - pointer.dragMc.oy, 0, groundY - 60);
    const ddx = nx - m.x, ddy = ny - m.y; m.x = nx; m.y = ny;
    for (const a of agents) { // stickmanii de pe Minecraft zboară cu el
      if (a.state === "climbwin" && a.climbWin === m) { a.x += ddx; a.tz -= ddy; a.hangTz -= ddy; }
      else if (a.state === "onwin" && a.onWin === m) { a.x += ddx; }
    }
    return;
  }
  if (pointer.mcBreaking) { mcBreakAt(pointer.x, pointer.y); return; } // drag în Minecraft ca să spargi mai multe
  if (pointer.paint && paintWin && paintWin.cur) {
    const c = paintWin._canvas;
    paintWin.cur.pts.push({ x: clamp(pointer.x, c.x, c.x + c.w) - c.x, y: clamp(pointer.y, c.y, c.y + c.h) - c.y });
    return;
  }
  if (pointer.down) {
    pointer.moved += Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
    if (!pointer.grabbed && pointer.cand && pointer.moved > 8) {
      pointer.grabbed = pointer.cand; pointer.grabbed.grab();
    }
    if (pointer.grabbed) pointer.grabbed.heldY = Math.min(pointer.y, groundY); // nu-l băga în pământ
  }
});
window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (pointer.dragStruct) { pointer.dragStruct = null; pointer.down = false; return; }
  if (pointer.resizeMc) { pointer.resizeMc = null; pointer.down = false; return; }
  if (pointer.dragMc) { pointer.dragMc = null; pointer.down = false; return; }
  if (pointer.mcBreaking) { pointer.mcBreaking = false; pointer.down = false; return; }
  if (pointer.resizeWin) { pointer.resizeWin = null; pointer.down = false; return; }
  if (pointer.dragWin) { pointer.dragWin = null; pointer.down = false; return; }
  if (pointer.paint) {
    if (paintWin && paintWin.cur) { paintWin.strokes.push(paintWin.cur); paintWin.cur = null; if (paintWin.strokes.length > 500) paintWin.strokes.shift(); }
    pointer.paint = false; pointer.down = false; pointer.cand = null; pointer.grabbed = null; return;
  }
  if (pointer.grabbed) {
    const g = pointer.grabbed, drop = dropTarget(pointer.x, pointer.y);
    if (drop && pointer.y < groundY - 20) { // lăsat deasupra unei aplicații / clădiri / desen
      if (drop.type === "win") { const vx = pointer.x - pointer.px, vy = pointer.y - pointer.py; g.release(vx * 1.3, vy * 1.3); g.landWin = drop.win; } // cade pe fereastră
      else if (drop.type === "struct") { const vx = pointer.x - pointer.px, vy = pointer.y - pointer.py; g.release(vx * 1.3, vy * 1.3); g.landStruct = drop.s; } // cade pe clădire
      else { g.release(0, 3); g.landDrawing = drop.d; } // cade DREPT pe vârful desenului (fără fling lateral/sus — desenele-s ținte mici)
    } else {
      const vx = pointer.x - pointer.px, vy = pointer.y - pointer.py;
      g.release(vx * 1.3, vy * 1.3);
    }
  } else if (pointer.moved < 8 && handleUIClick(pointer.x, pointer.y)) {
    // consumat de taskbar / fereastra Chrome
  } else if (pointer.cand && pointer.moved < 8) {
    const a = pointer.cand, now = performance.now();
    if (paintWin) { sendToPaint(a); lastClick = { agent: a, time: now }; } // Paint pornit → vine la Paint
    else if (lastClick.agent === a && now - lastClick.time < 350) { fightSelect(a); lastClick.agent = null; } // dublu-click
    else { a.getHit(pointer.x); lastClick = { agent: a, time: now }; }
  }
  pointer.down = false; pointer.cand = null; pointer.grabbed = null;
});

function handleUIClick(x, y) {
  // notepad
  if (notepadWin) {
    const n = notepadWin;
    if (n._xb) { const b = n._xb; if (x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s) { closeNotepad(); return true; } }
    if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return true;
  }
  // cronometru
  if (stopwatchWin) {
    const s = stopwatchWin;
    if (s._xb) { const b = s._xb; if (x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s) { closeStopwatch(); return true; } }
    if (s._btns) for (const b of s._btns) { if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { swBtn(b.id); return true; } }
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  }
  // Minecraft 2D (acoperă tot — consumă click-urile)
  if (minecraftWin) {
    const m = minecraftWin;
    if (m._xb) { const b = m._xb; if (x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s) { closeMinecraft(); return true; } }
    if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return true;
  }
  // Paint
  if (paintWin) {
    const p = paintWin;
    if (p._xb) { const b = p._xb; if (x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s) { closePaint(); return true; } }
    if (p._sw) for (const sw of p._sw) { if (x >= sw.x && x <= sw.x + sw.s && y >= sw.y && y <= sw.y + sw.s) { p.color = sw.c; return true; } }
    if (p._clear) { const b = p._clear; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { p.strokes = []; return true; } }
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  }
  // Chrome
  if (browserWin && browserWin._xb) { const b = browserWin._xb; if (x >= b.x && x <= b.x + b.s && y >= b.y && y <= b.y + b.s) { closeChrome(); return true; } }
  if (browserWin) { const b = browserWin; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true; }
  for (const ic of taskIcons) { if (Math.abs(x - ic.cx) <= ic.s / 2 && Math.abs(y - ic.cy) <= ic.s / 2) { iconAction(ic.name); return true; } }
  return false;
}
function iconAction(name) {
  if (name === "chrome" || name === "search") openChrome();
  else if (name === "minecraft") { if (minecraftWin) closeMinecraft(); else openMinecraft(); }
  else if (name === "lol") triggerRandomFight();
  else if (name === "stopwatch") openStopwatch();
  else if (name === "notepad") openNotepad();
  else if (name === "paint") openPaint();
  else if (name === "start") pick([openChrome, triggerBuild, triggerRandomFight])();
}
function openPaint() { const y = 90, w = Math.min(700, W - 40), h = Math.min(520, groundY - y - 40); paintWin = { x: Math.round((W - w) / 2), y, w, h, strokes: [], cur: null, color: "#ffffff" }; }
function sendToPaint(a) {
  if (!a || a.isPlayer || a.away || a.state === "held" || a.state === "thrown" || a.state === "leaving") return;
  if (a.opponent) a.endFight();
  a._pd = null; a._pdTargets = null; a.gpPhase = undefined; a.gpTargetX = undefined;
  a.lie = 0; a.sleepPhase = null; a.jumping = false; a.tz = 0; a.building = null;
  a.state = "gopaint"; a.targetX = null;
  a.speak(pick(["Vin! 🎨", "La Paint!", "Și eu desenez!"]), 90);
}
function closePaint() { paintWin = null; }
// ferestrele pe care stickmanii se pot urca (nu Minecraft — e fullscreen cu lumea lui)
function openWindows() { const l = []; if (browserWin) l.push(browserWin); if (stopwatchWin) l.push(stopwatchWin); if (notepadWin) l.push(notepadWin); if (paintWin) l.push(paintWin); return l; }
// ferestre pe care se poate STA/urca — include Minecraft (dar Minecraft are drag/resize propriu)
function standWindows() { const l = openWindows(); if (minecraftWin) l.push(minecraftWin); return l; }
// case/structuri: cutie de coliziune (pt. apucat) și hit-test
function structBox(s) { const d = { house: [62, 138], tower: [34, 172], tree: [42, 122], campfire: [40, 56] }[s.type] || [50, 120]; const sc = s.scale || 1; return { hw: d[0] * sc, h: d[1] * sc }; }
function structureAt(x, y) { for (let i = structures.length - 1; i >= 0; i--) { const s = structures[i], b = structBox(s), base = s.by || groundY; if (x >= s.x - b.hw && x <= s.x + b.hw && y >= base - b.h && y <= base) return s; } return null; }
// bara de titlu a unei ferestre (pt. drag), exclude butonul de închidere din dreapta
function titleBarAt(x, y) { for (const w of openWindows()) if (x >= w.x && x <= w.x + w.w - 30 && y >= w.y && y <= w.y + 28) return w; return null; }
// mânerul de redimensionare (colț dreapta-jos)
function resizeHandleAt(x, y) { for (const w of openWindows()) if (x >= w.x + w.w - 20 && x <= w.x + w.w && y >= w.y + w.h - 20 && y <= w.y + w.h) return w; return null; }
function drawResizeHandles() {
  ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.lineCap = "round";
  for (const w of openWindows()) { const rx = w.x + w.w - 5, ry = w.y + w.h - 5; for (let i = 0; i < 3; i++) { const o = 5 + i * 4; ctx.beginPath(); ctx.moveTo(rx - o, ry); ctx.lineTo(rx, ry - o); ctx.stroke(); } }
  ctx.restore();
}
// pe ce se lasă un stickman apucat (fereastră sau desen) — ca să rămână acolo
function dropTarget(x, y) {
  // orice y DEASUPRA ferestrei (până la baza ei), în coloana ei → se prinde pe ea
  for (const w of standWindows()) if (x >= w.x && x <= w.x + w.w && y <= w.y + w.h) return { type: "win", win: w };
  for (const s of structures) { const b = structBox(s), base = s.by || groundY; if (x >= s.x - b.hw && x <= s.x + b.hw && y <= base) return { type: "struct", s }; } // pe o clădire
  for (const d of drawings) if (Math.abs(x - d.cx) < d.s * 1.6 && Math.abs(y - d.cy) < d.s * 1.6) return { type: "draw", d };
  return null;
}
function openNotepad() { const t = 'a = 1\nprint(a)'; const y = 120, w = 360, h = Math.min(300, groundY - y - 40); notepadWin = { x: Math.min(W - w - 20, Math.round(W / 2 - w / 2) + 180), y, w, h, text: t, cursor: t.length }; }
function closeNotepad() { notepadWin = null; }

// ---- mini-interpretor Python (variabile, print, + - * /) ----
function pyStr(v) { if (v === true) return "True"; if (v === false) return "False"; if (v === null || v === undefined) return "None"; return String(v); }
function pyEval(expr, vars) {
  const toks = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === '"' || ch === "'") { let j = i + 1, s = ""; while (j < expr.length && expr[j] !== ch) { s += expr[j]; j++; } toks.push({ t: "str", v: s }); i = j + 1; continue; }
    if (/[0-9.]/.test(ch)) { let j = i, num = ""; while (j < expr.length && /[0-9.]/.test(expr[j])) { num += expr[j]; j++; } toks.push({ t: "num", v: parseFloat(num) }); i = j; continue; }
    if (/[a-zA-Z_]/.test(ch)) { let j = i, id = ""; while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) { id += expr[j]; j++; } toks.push({ t: "id", v: id }); i = j; continue; }
    if ("+-*/()".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
    i++;
  }
  let pos = 0; const peek = () => toks[pos], next = () => toks[pos++];
  function addSub() {
    let l = mulDiv();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v, r = mulDiv();
      if (op === "+") l = (typeof l === "string" || typeof r === "string") ? pyStr(l) + pyStr(r) : l + r;
      else l = l - r;
    }
    return l;
  }
  function mulDiv() { let l = atom(); while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const op = next().v, r = atom(); l = op === "*" ? l * r : l / r; } return l; }
  function atom() {
    const tk = peek(); if (!tk) return "";
    if (tk.t === "num") { next(); return tk.v; }
    if (tk.t === "str") { next(); return tk.v; }
    if (tk.t === "id") { next(); if (tk.v === "True") return true; if (tk.v === "False") return false; return (tk.v in vars) ? vars[tk.v] : tk.v; }
    if (tk.t === "op" && tk.v === "(") { next(); const v = addSub(); if (peek() && peek().v === ")") next(); return v; }
    if (tk.t === "op" && tk.v === "-") { next(); return -atom(); }
    next(); return "";
  }
  return addSub();
}
function pySplitArgs(s) {
  const args = []; let depth = 0, cur = "", inStr = null;
  for (const ch of s) {
    if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
    if (ch === "(") depth++; if (ch === ")") depth--;
    if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur);
  return args;
}
function execLine(line, vars) {
  line = line.trim();
  if (!line || line.startsWith("#")) return;
  const um = line.match(/^unprint\((.*)\)\s*$/);
  if (um) { for (const arg of pySplitArgs(um[1])) { if (arg.trim() === "stickman") removeStickman(); } return; }
  const pm = line.match(/^print\((.*)\)\s*$/);
  if (pm) {
    const out = [];
    for (const arg of pySplitArgs(pm[1])) {
      if (arg.trim() === "stickman") spawnStickman(); // print(stickman) → creează un stickman
      else out.push(pyStr(pyEval(arg, vars)));
    }
    if (out.length) printToGround(out.join(" "));
    return;
  }
  const am = line.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (am && !/[=<>!]=/.test(line)) { vars[am[1]] = pyEval(am[2], vars); }
}
function runPython(text) {
  const vars = {};
  const lines = text.split("\n");
  const indentOf = (l) => l.match(/^(\s*)/)[1].length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "" || lines[i].trim().startsWith("#")) continue;
    const line = lines[i].trim();
    // do(N): ...  sau  for x in range(N): ...
    const m = line.match(/^(?:do\(\s*(.+?)\s*\)|for\s+([a-zA-Z_]\w*)\s+in\s+range\(\s*(.+?)\s*\))\s*:\s*(.*)$/);
    if (m) {
      const count = clamp(Math.floor(pyEval(m[1] || m[3], vars)) || 0, 0, 5000);
      const loopVar = m[2] || null, inline = m[4].trim();
      let body = [];
      if (inline) body = [inline];
      else {
        const hi = indentOf(lines[i]); let j = i + 1;
        while (j < lines.length && (lines[j].trim() === "" || indentOf(lines[j]) > hi)) { if (lines[j].trim()) body.push(lines[j]); j++; }
        i = j - 1;
      }
      for (let k = 0; k < count; k++) { if (loopVar) vars[loopVar] = k; for (const bl of body) execLine(bl, vars); }
      continue;
    }
    execLine(line, vars);
  }
}
let groundTexts = [];
function printToGround(msg) { groundTexts.push({ x: rand(140, W - 140), y: groundY - 24, text: msg, life: 260 }); if (groundTexts.length > 150) groundTexts.splice(0, groundTexts.length - 150); }
function drawGroundTexts() {
  ctx.save(); ctx.textAlign = "center"; ctx.font = "bold 24px 'Segoe UI', sans-serif";
  for (let i = groundTexts.length - 1; i >= 0; i--) {
    const g = groundTexts[i]; g.y -= 0.25; g.life--;
    ctx.globalAlpha = Math.min(1, g.life / 60); ctx.fillStyle = "#7ee6a0"; ctx.shadowColor = "#7ee6a0"; ctx.shadowBlur = 8;
    ctx.fillText(g.text, g.x, g.y);
    if (g.life <= 0) groundTexts.splice(i, 1);
  }
  ctx.restore();
}
// ---- Desene pe wallpaper (doodles) ----
function circlePts(cx, cy, r, n) { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } return p; }
function arcPts(cx, cy, r, a0, a1, n) { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } return p; }
function starPts(cx, cy, r) { const p = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 === 0 ? r : r * 0.45; p.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); } return p; }
function heartPts(cx, cy, s) { const p = []; for (let i = 0; i <= 26; i++) { const t = i / 26 * Math.PI * 2; const x = 16 * Math.pow(Math.sin(t), 3); const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p.push({ x: cx + x * s / 16, y: cy - y * s / 16 }); } return p; }
function makeDoodle(cx, cy, s, color) {
  const type = pick(["smiley", "star", "heart", "house", "sun", "flower", "squiggle", "cat"]);
  const strokes = [];
  if (type === "smiley") {
    strokes.push(circlePts(cx, cy, s, 26));
    strokes.push(circlePts(cx - s * 0.32, cy - s * 0.22, s * 0.09, 7));
    strokes.push(circlePts(cx + s * 0.32, cy - s * 0.22, s * 0.09, 7));
    strokes.push(arcPts(cx, cy + s * 0.08, s * 0.5, 0.2 * Math.PI, 0.8 * Math.PI, 12));
  } else if (type === "star") { strokes.push(starPts(cx, cy, s)); }
  else if (type === "heart") { strokes.push(heartPts(cx, cy, s)); }
  else if (type === "house") {
    strokes.push([{ x: cx - s * 0.6, y: cy + s * 0.55 }, { x: cx - s * 0.6, y: cy - s * 0.15 }, { x: cx + s * 0.6, y: cy - s * 0.15 }, { x: cx + s * 0.6, y: cy + s * 0.55 }, { x: cx - s * 0.6, y: cy + s * 0.55 }]);
    strokes.push([{ x: cx - s * 0.72, y: cy - s * 0.15 }, { x: cx, y: cy - s * 0.85 }, { x: cx + s * 0.72, y: cy - s * 0.15 }]);
  } else if (type === "sun") {
    strokes.push(circlePts(cx, cy, s * 0.5, 16));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; strokes.push([{ x: cx + Math.cos(a) * s * 0.62, y: cy + Math.sin(a) * s * 0.62 }, { x: cx + Math.cos(a) * s, y: cy + Math.sin(a) * s }]); }
  } else if (type === "flower") {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; strokes.push(circlePts(cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5, s * 0.3, 10)); }
    strokes.push(circlePts(cx, cy, s * 0.24, 9));
  } else if (type === "cat") {
    strokes.push(circlePts(cx, cy, s * 0.6, 18));
    strokes.push([{ x: cx - s * 0.5, y: cy - s * 0.35 }, { x: cx - s * 0.62, y: cy - s * 0.75 }, { x: cx - s * 0.22, y: cy - s * 0.5 }]);
    strokes.push([{ x: cx + s * 0.5, y: cy - s * 0.35 }, { x: cx + s * 0.62, y: cy - s * 0.75 }, { x: cx + s * 0.22, y: cy - s * 0.5 }]);
  } else { // squiggle
    const pts = []; for (let i = 0; i <= 22; i++) pts.push({ x: cx - s + i * (2 * s / 22), y: cy + Math.sin(i * 0.85) * s * 0.4 }); strokes.push(pts);
  }
  return { strokes, color, totalPts: strokes.reduce((a, st) => a + st.length, 0), cx, cy, s };
}
function makeSwordDoodle(cx, cy, s, color) {
  const strokes = [];
  strokes.push([{ x: cx, y: cy - s * 1.3 }, { x: cx, y: cy + s * 0.5 }]);                    // lama
  strokes.push([{ x: cx - s * 0.13, y: cy - s * 1.05 }, { x: cx, y: cy - s * 1.35 }, { x: cx + s * 0.13, y: cy - s * 1.05 }]); // vârf
  strokes.push([{ x: cx - s * 0.5, y: cy + s * 0.5 }, { x: cx + s * 0.5, y: cy + s * 0.5 }]); // gardă
  strokes.push([{ x: cx, y: cy + s * 0.5 }, { x: cx, y: cy + s * 0.95 }]);                    // mâner
  return { strokes, color, totalPts: strokes.reduce((a, st) => a + st.length, 0), cx, cy, s, isSword: true };
}
function makeBowDoodle(cx, cy, s, color) {
  const strokes = [];
  const arc = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI * 0.42 + (Math.PI * 0.84) * i / 10; arc.push({ x: cx + Math.cos(a) * s * 0.9 - s * 0.4, y: cy + Math.sin(a) * s }); }
  strokes.push(arc);                                                                  // corpul arcului
  strokes.push([{ x: arc[0].x, y: arc[0].y }, { x: arc[arc.length - 1].x, y: arc[arc.length - 1].y }]); // coarda
  strokes.push([{ x: cx - s * 0.5, y: cy }, { x: cx + s * 0.9, y: cy }]);             // săgeata
  return { strokes, color, totalPts: strokes.reduce((a, st) => a + st.length, 0), cx, cy, s, isBow: true };
}
function drawSwordIcon(x, y, len, blade) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = blade; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, -len * 0.75); ctx.lineTo(0, len * 0.3); ctx.stroke();
  ctx.strokeStyle = "#c8963c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-len * 0.3, len * 0.3); ctx.lineTo(len * 0.3, len * 0.3); ctx.stroke();
  ctx.strokeStyle = "#7a5a3a"; ctx.beginPath(); ctx.moveTo(0, len * 0.3); ctx.lineTo(0, len * 0.55); ctx.stroke();
  ctx.restore();
}
function drawBowIcon(x, y, len) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(-len * 0.2, 0, len * 0.7, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
  ctx.strokeStyle = "#d8d8d8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-len * 0.2 + Math.cos(-Math.PI * 0.42) * len * 0.7, Math.sin(-Math.PI * 0.42) * len * 0.7); ctx.lineTo(-len * 0.2 + Math.cos(Math.PI * 0.42) * len * 0.7, Math.sin(Math.PI * 0.42) * len * 0.7); ctx.stroke();
  ctx.restore();
}
function drawWeapons() {
  for (const wp of weapons) { if (wp.taken) continue; wp.bob = (wp.bob || 0) + 0.08; const y = groundY - 22 - Math.abs(Math.sin(wp.bob)) * 7; if (wp.type === "bow") drawBowIcon(wp.x, y, 24); else drawSwordIcon(wp.x, y, 24, "#dfe6f2"); }
}
function updateArrows() {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i]; a.x += a.vx; a.life--;
    const o = a.foe;
    if (o && !o.away && o.state !== "held" && o.state !== "dead" && Math.abs(a.x - o.x) < 22) { o.recoil = 14; o.stars = [{ ang: 0, r: 22 }, { ang: 2, r: 22 }, { ang: 4, r: 22 }]; if (Math.random() < 0.2) o.die(); else if (!o.say) o.speak(pick(o.c.hitLines), 45); arrows.splice(i, 1); continue; }
    if (a.life <= 0 || a.x < -30 || a.x > W + 30) arrows.splice(i, 1);
  }
}
function drawArrows() {
  ctx.save(); ctx.strokeStyle = "#caa46a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const a of arrows) { const d = Math.sign(a.vx) || 1; ctx.beginPath(); ctx.moveTo(a.x - d * 14, a.y); ctx.lineTo(a.x, a.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - d * 6, a.y - 4); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - d * 6, a.y + 4); ctx.stroke(); }
  ctx.restore();
}
function drawDoodle(d, reveal) {
  const count = reveal === undefined ? d.totalPts : reveal;
  ctx.save(); ctx.strokeStyle = d.color; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = d.color; ctx.shadowBlur = 6;
  let used = 0;
  for (const st of d.strokes) {
    const take = Math.max(0, Math.min(st.length, count - used));
    if (take >= 2) { ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y); for (let i = 1; i < take; i++) ctx.lineTo(st[i].x, st[i].y); ctx.stroke(); }
    used += st.length;
    if (used >= count) break;
  }
  ctx.restore();
}
function drawWallpaper() {
  for (const d of drawings) drawDoodle(d);
  for (const a of agents) if (a.state === "draw" && a.doodle) drawDoodle(a.doodle, Math.floor(a.doodleReveal));
}
// ================= MINECRAFT 2D =================
// tipuri bloc: 0 aer, 1 iarbă, 2 pământ, 3 piatră, 4 lemn, 5 frunze, 6 scânduri
function openMinecraft() {
  if (window.recallAdventurers) window.recallAdventurers(); // toți din expediție vin înapoi
  const x = 12, y = 24, t = 30;
  const cols = Math.floor((W - 24) / t), rows = Math.floor((groundY - 40) / t);
  const m = { x, y, w: cols * t, h: rows * t, tile: t, cols, rows, wood: 0, grid: [], groundRow: 0 };
  mcGenWorld(m);
  m.mobs = agents.map(a => ({
    color: a.c.color, hollow: !!a.c.hollowHead, crown: !!a.c.crown, headR: a.c.headR || 20,
    px: (1 + Math.floor(Math.random() * (cols - 2)) + 0.5) * t, py: m.groundRow * t,
    vx: 0, vy: 0, face: Math.random() < 0.5 ? -1 : 1, onGround: false,
    state: "idle", timer: rand(15, 90), walkPhase: Math.random() * 6, wood: 0, mineC: 0, mineR: 0, mineProg: 0,
  }));
  // TU — personajul controlat de tine (gri, cu marcaj)
  m.mobs.push({
    isPlayer: true, color: "#aab0be", hollow: false, crown: false, headR: 20,
    px: (Math.floor(cols / 2) + 0.5) * t, py: m.groundRow * t,
    vx: 0, vy: 0, face: 1, onGround: false, state: "idle", timer: 1e9, walkPhase: 0, wood: 0, mineC: 0, mineR: 0, mineProg: 0, wantJump: false,
  });
  minecraftWin = m;
}
function closeMinecraft() { minecraftWin = null; }
function mcGenWorld(m) {
  const { cols, rows } = m; const g = []; const gr = rows - 5; m.groundRow = gr;
  for (let r = 0; r < rows; r++) { g[r] = []; for (let c = 0; c < cols; c++) { let ty = 0; if (r === gr) ty = 1; else if (r > gr && r < gr + 3) ty = 2; else if (r >= gr + 3) ty = 3; g[r][c] = ty; } }
  const nTrees = Math.max(2, Math.floor(cols / 7));
  for (let i = 0; i < nTrees; i++) {
    const c = 2 + Math.floor(Math.random() * (cols - 4)); const th = 3 + Math.floor(Math.random() * 2);
    for (let k = 1; k <= th; k++) g[gr - k][c] = 4;
    const top = gr - th;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = top + dr, cc = c + dc; if (g[rr] && g[rr][cc] === 0) g[rr][cc] = 5; }
    if (g[top - 1]) g[top - 1][c] = 5;
  }
  m.grid = g;
}
function mcType(m, c, r) { if (c < 0 || c >= m.cols) return 3; if (r < 0) return 0; if (r >= m.rows) return 3; return m.grid[r][c]; }
function mcSolid(m, c, r) { const ty = mcType(m, c, r); return ty !== 0 && ty !== 5; } // frunzele nu sunt solide
function mcFindTarget(m, mob) {
  const c0 = Math.floor(mob.px / m.tile), r0 = Math.floor((mob.py - m.tile * 0.5) / m.tile);
  let wood = null, dig = null;
  for (let dc = -3; dc <= 3; dc++) for (let dr = -3; dr <= 1; dr++) {
    const c = c0 + dc, r = r0 + dr, ty = mcType(m, c, r), d = Math.abs(dc) + Math.abs(dr);
    if (ty === 4 && (!wood || d < wood.d)) wood = { c, r, d };
    if ((ty === 1 || ty === 2) && Math.abs(dc) <= 1 && dr >= 0 && !dig) dig = { c, r };
  }
  return wood || dig;
}
function mcPlace(m, mob) {
  const c = Math.floor(mob.px / m.tile) + mob.face, r = Math.floor((mob.py - 1) / m.tile);
  if (c >= 0 && c < m.cols && r >= 0 && mcType(m, c, r) === 0) { m.grid[r][c] = 6; mob.wood--; }
}
// tu spargi un bloc cu left-click / drag
function mcBreakAt(sx, sy) {
  const m = minecraftWin; if (!m) return false;
  if (sy < m.y + 26 || sx < m.x || sx > m.x + m.w || sy > m.y + m.h) return false; // nu sub bara de titlu / în afară
  const c = Math.floor((sx - m.x) / m.tile), r = Math.floor((sy - m.y) / m.tile);
  if (c < 0 || c >= m.cols || r < 0 || r >= m.rows) return false;
  const ty = m.grid[r][c];
  if (ty) { m.grid[r][c] = 0; if (ty === 4) m.wood++; return true; }
  return false;
}
// tu pui un bloc cu right-click — doar dacă locul e liber
function mcPlaceAt(sx, sy) {
  const m = minecraftWin; if (!m) return false;
  if (sy < m.y + 26 || sx < m.x || sx > m.x + m.w || sy > m.y + m.h) return false;
  const c = Math.floor((sx - m.x) / m.tile), r = Math.floor((sy - m.y) / m.tile);
  if (c < 0 || c >= m.cols || r < 0 || r >= m.rows) return false;
  if (m.grid[r][c] !== 0) return false; // ocupat deja
  m.grid[r][c] = 6; // scânduri
  return true;
}
function mcPickAction(m, mob) {
  const r = Math.random();
  if (r < 0.42) { mob.state = "walk"; mob.vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.7); mob.face = Math.sign(mob.vx); mob.timer = rand(40, 110); }
  else if (r < 0.8) { const tgt = mcFindTarget(m, mob); if (tgt) { mob.state = "mine"; mob.mineC = tgt.c; mob.mineR = tgt.r; mob.mineProg = 0; mob.vx = 0; mob.face = (tgt.c + 0.5) * m.tile > mob.px ? 1 : -1; mob.timer = rand(70, 150); } else { mob.state = "walk"; mob.vx = (Math.random() < 0.5 ? -1 : 1) * 1.2; mob.timer = 50; } }
  else { if (mob.wood > 0) mcPlace(m, mob); mob.state = "idle"; mob.timer = rand(25, 60); }
}
function updateMinecraft() {
  const m = minecraftWin; if (!m) return; const t = m.tile;
  for (const mob of m.mobs) {
    mob.vy = Math.min(mob.vy + 0.6, 12); mob.py += mob.vy;
    const fc = clamp(Math.floor(mob.px / t), 0, m.cols - 1), fr = Math.floor(mob.py / t);
    if (mcSolid(m, fc, fr)) { mob.py = fr * t; mob.vy = 0; mob.onGround = true; } else mob.onGround = false;
    if (mob.isPlayer) { mcPlayerControl(m, mob); continue; } // TU — controlat de taste
    if (--mob.timer <= 0) mcPickAction(m, mob);
    if (mob.state === "walk") {
      mob.px += mob.vx; mob.walkPhase += 0.2;
      const dir = Math.sign(mob.vx) || 1, wc = Math.floor((mob.px + dir * t * 0.3) / t), br = Math.floor((mob.py - t * 0.5) / t);
      if (mcSolid(m, wc, br)) { if (mob.onGround && !mcSolid(m, wc, br - 1)) mob.vy = -9; else { mob.px -= mob.vx; mob.vx *= -1; mob.face = Math.sign(mob.vx); } }
      mob.px = clamp(mob.px, t * 0.5, m.w - t * 0.5);
    } else if (mob.state === "mine") {
      const ty = mcType(m, mob.mineC, mob.mineR);
      if (ty === 0) { mob.state = "idle"; mob.timer = 15; }
      else { mob.mineProg += 0.02; if (mob.mineProg >= 1) { m.grid[mob.mineR][mob.mineC] = 0; if (ty === 4) { mob.wood++; m.wood++; } mob.state = "idle"; mob.timer = rand(20, 50); } }
    }
  }
}
function mcPlayerControl(m, mob) {
  const t = m.tile;
  let dir = 0;
  if (keys.has("a") || keys.has("arrowleft")) dir -= 1;
  if (keys.has("d") || keys.has("arrowright")) dir += 1;
  if (dir) {
    mob.face = dir; mob.walkPhase += 0.22; mob.state = "walk";
    const nx = mob.px + dir * 2.6, wc = Math.floor((nx + dir * t * 0.3) / t), br = Math.floor((mob.py - t * 0.5) / t);
    if (!mcSolid(m, wc, br)) mob.px = clamp(nx, t * 0.5, m.w - t * 0.5);
    else if (mob.onGround && !mcSolid(m, wc, br - 1)) mob.vy = -9; // urcă automat o treaptă
  } else mob.state = "idle";
  if (mob.wantJump && mob.onGround) mob.vy = -10.5; // sărit
  mob.wantJump = false;
}
function mcBlockColor(ty) { return { 1: "#5aab3a", 2: "#7a5a3a", 3: "#828289", 4: "#6b4a2a", 5: "#3f8f3a", 6: "#b8894e" }[ty] || "#000"; }
function mcDrawBlock(x, y, s, ty) {
  ctx.fillStyle = mcBlockColor(ty); ctx.fillRect(x, y, s, s);
  if (ty === 1) { ctx.fillStyle = "#7a5a3a"; ctx.fillRect(x, y + s * 0.3, s, s * 0.7); ctx.fillStyle = "#5aab3a"; ctx.fillRect(x, y, s, s * 0.34); }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  if (ty === 3) { ctx.fillRect(x + s * 0.2, y + s * 0.3, s * 0.18, s * 0.14); ctx.fillRect(x + s * 0.55, y + s * 0.58, s * 0.2, s * 0.15); }
  if (ty === 4) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + s * 0.32, y); ctx.lineTo(x + s * 0.32, y + s); ctx.moveTo(x + s * 0.68, y); ctx.lineTo(x + s * 0.68, y + s); ctx.stroke(); }
  if (ty === 5) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x + s * 0.1, y + s * 0.12, s * 0.22, s * 0.22); ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x + s * 0.6, y + s * 0.5, s * 0.22, s * 0.22); }
  if (ty === 6) { ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x + s, y + s * 0.5); ctx.stroke(); }
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}
function mcCracks(m, mob) {
  const t = m.tile, x = m.x + mob.mineC * t, y = m.y + mob.mineR * t;
  ctx.save(); ctx.strokeStyle = "rgba(0,0,0," + (0.25 + mob.mineProg * 0.5) + ")"; ctx.lineWidth = 1.5;
  const n = Math.ceil(mob.mineProg * 4);
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(x + (i % 2 ? 4 : t - 4), y + 4); ctx.lineTo(x + t / 2, y + t / 2); ctx.lineTo(x + (i % 2 ? t - 6 : 6), y + t - 4); ctx.stroke(); }
  ctx.restore();
}
function mcDrawMob(m, mob) {
  const t = m.tile, s = t / 72;
  ctx.save(); ctx.translate(m.x + mob.px, m.y + mob.py); ctx.scale(mob.face * s, s);
  ctx.strokeStyle = mob.color; ctx.fillStyle = mob.color; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const hipY = -52, shY = -96, hy = shY - 8 - mob.headR;
  const stride = mob.state === "walk" ? Math.sin(mob.walkPhase) * 14 : 5;
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(-5 + stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(5 - stride, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(0, shY); ctx.stroke();
  if (mob.state === "mine") {
    const sw = Math.sin(frame * 0.4) * 26;
    ctx.beginPath(); ctx.moveTo(0, shY + 4); ctx.lineTo(20, shY + 2 + sw * 0.4); ctx.lineTo(30, shY - 6 + sw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, shY + 4); ctx.lineTo(-12, shY + 16); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(0, shY + 4); ctx.lineTo(-11, shY + 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, shY + 4); ctx.lineTo(11, shY + 18); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, hy, mob.headR, 0, Math.PI * 2); if (mob.hollow) ctx.stroke(); else ctx.fill();
  if (mob.crown) { const cr = mob.headR; ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(-cr * 0.7, hy - cr * 0.9); ctx.lineTo(-cr * 0.7, hy - cr * 1.4); ctx.lineTo(-cr * 0.3, hy - cr * 1.1); ctx.lineTo(0, hy - cr * 1.6); ctx.lineTo(cr * 0.3, hy - cr * 1.1); ctx.lineTo(cr * 0.7, hy - cr * 1.4); ctx.lineTo(cr * 0.7, hy - cr * 0.9); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawMinecraft() {
  if (!minecraftWin) return; const m = minecraftWin, t = m.tile;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#8fd0ff"; ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();
  const gsky = ctx.createLinearGradient(0, m.y, 0, m.y + m.h); gsky.addColorStop(0, "#8fd0ff"); gsky.addColorStop(1, "#d3efff"); ctx.fillStyle = gsky; ctx.fillRect(m.x, m.y, m.w, m.h);
  for (let r = 0; r < m.rows; r++) { const row = m.grid[r]; for (let c = 0; c < m.cols; c++) { const ty = row[c]; if (ty) mcDrawBlock(m.x + c * t, m.y + r * t, t, ty); } }
  for (const mob of m.mobs) mcDrawMob(m, mob);
  for (const mob of m.mobs) if (mob.state === "mine") mcCracks(m, mob);
  const pm = m.mobs.find(mo => mo.isPlayer);
  if (pm) {
    const mx = m.x + pm.px, my = m.y + pm.py - 72 + Math.sin(frame * 0.12) * 3;
    ctx.save(); ctx.fillStyle = "#ffe14d"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.font = "bold 13px 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.strokeText("TU", mx, my); ctx.fillText("TU", mx, my);
    ctx.beginPath(); ctx.moveTo(mx - 6, my + 5); ctx.lineTo(mx + 6, my + 5); ctx.lineTo(mx, my + 13); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = "rgba(20,20,26,0.92)"; ctx.fillRect(m.x, m.y, m.w, 26);
  ctx.fillStyle = "#e8ecff"; ctx.font = "13px 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("⛏️ Minecraft 2D", m.x + 12, m.y + 14);
  ctx.textAlign = "right"; ctx.fillText("🪵 " + m.wood, m.x + m.w - 44, m.y + 14); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const xb = { x: m.x + m.w - 24, y: m.y + 5, s: 18 }; m._xb = xb;
  const hov = pointer.x >= xb.x && pointer.x <= xb.x + xb.s && pointer.y >= xb.y && pointer.y <= xb.y + xb.s;
  ctx.fillStyle = hov ? "#e81123" : "#4a4b50"; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(xb.x, xb.y, xb.s, xb.s, 5); else ctx.rect(xb.x, xb.y, xb.s, xb.s); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb.x + 5, xb.y + 5); ctx.lineTo(xb.x + xb.s - 5, xb.y + xb.s - 5); ctx.moveTo(xb.x + xb.s - 5, xb.y + 5); ctx.lineTo(xb.x + 5, xb.y + xb.s - 5); ctx.stroke();
  // mâner de scalare (colț dreapta-jos)
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) { const o = 5 + i * 4; ctx.beginPath(); ctx.moveTo(m.x + m.w - 5 - o, m.y + m.h - 5); ctx.lineTo(m.x + m.w - 5, m.y + m.h - 5 - o); ctx.stroke(); }
  ctx.restore();
}

function layoutNotepad(text, maxW, cursor) {
  ctx.font = "14px 'Consolas', monospace";
  const lines = []; let line = "", curRow = 0, curX = 0, placed = false;
  const put = (i) => { if (i === cursor) { curRow = lines.length; curX = ctx.measureText(line).width; placed = true; } };
  for (let i = 0; i < text.length; i++) {
    put(i);
    const ch = text[i];
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ""; }
    line += ch;
  }
  put(text.length); lines.push(line);
  if (!placed) { curRow = lines.length - 1; curX = ctx.measureText(line).width; }
  return { lines, curRow, curX };
}
function drawNotepad() {
  if (!notepadWin) return;
  const n = notepadWin;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#202124"; rr(n.x, n.y, n.w, n.h, 12); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#35363a"; rr(n.x, n.y, n.w, 28, 12); ctx.fill(); ctx.fillRect(n.x, n.y + 16, n.w, 12);
  ctx.fillStyle = "#e8ecff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("📝 Notepad", n.x + 12, n.y + 19);
  const xb = { x: n.x + n.w - 24, y: n.y + 6, s: 18 }; n._xb = xb;
  const hov = pointer.x >= xb.x && pointer.x <= xb.x + xb.s && pointer.y >= xb.y && pointer.y <= xb.y + xb.s;
  ctx.fillStyle = hov ? "#e81123" : "#4a4b50"; rr(xb.x, xb.y, xb.s, xb.s, 5); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb.x + 5, xb.y + 5); ctx.lineTo(xb.x + xb.s - 5, xb.y + xb.s - 5); ctx.moveTo(xb.x + xb.s - 5, xb.y + 5); ctx.lineTo(xb.x + 5, xb.y + xb.s - 5); ctx.stroke();
  const px = n.x + 8, py = n.y + 34, pw = n.w - 16, ph = n.h - 42;
  ctx.fillStyle = "#fbfbf7"; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = "#1a1a1a"; ctx.font = "14px 'Consolas', monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const lh = 18, maxLines = Math.floor((ph - 10) / lh);
  const lay = layoutNotepad(n.text, pw - 16, n.cursor === undefined ? n.text.length : n.cursor);
  const startLine = Math.max(0, Math.min(lay.curRow - maxLines + 1, lay.lines.length - maxLines));
  const view = lay.lines.slice(Math.max(0, startLine));
  let ly = py + 6;
  for (let i = 0; i < view.length && i < maxLines; i++) { ctx.fillText(view[i], px + 8, ly + i * lh); }
  // cursor de editare
  if (Math.floor(frame / 30) % 2 === 0) {
    const vr = lay.curRow - Math.max(0, startLine);
    if (vr >= 0 && vr < maxLines) { ctx.fillStyle = "#1a1a1a"; ctx.fillRect(px + 8 + lay.curX, py + 6 + vr * lh, 2, 15); }
  }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---- MS Paint ----
function drawPaint() {
  if (!paintWin) return;
  const p = paintWin;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#202124"; rr(p.x, p.y, p.w, p.h, 12); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // bară titlu
  ctx.fillStyle = "#35363a"; rr(p.x, p.y, p.w, 28, 12); ctx.fill(); ctx.fillRect(p.x, p.y + 16, p.w, 12);
  ctx.fillStyle = "#e8ecff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("🎨 Paint", p.x + 12, p.y + 19);
  const xb = { x: p.x + p.w - 24, y: p.y + 6, s: 18 }; p._xb = xb;
  const hov = pointer.x >= xb.x && pointer.x <= xb.x + xb.s && pointer.y >= xb.y && pointer.y <= xb.y + xb.s;
  ctx.fillStyle = hov ? "#e81123" : "#4a4b50"; rr(xb.x, xb.y, xb.s, xb.s, 5); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb.x + 5, xb.y + 5); ctx.lineTo(xb.x + xb.s - 5, xb.y + xb.s - 5); ctx.moveTo(xb.x + xb.s - 5, xb.y + 5); ctx.lineTo(xb.x + 5, xb.y + xb.s - 5); ctx.stroke();
  // paletă de culori
  const ty = p.y + 34, sw = 20, sg = 6; let sx = p.x + 12; p._sw = [];
  for (const c of PAINT_COLORS) {
    ctx.fillStyle = c; rr(sx, ty, sw, sw, 4); ctx.fill();
    if (c === p.color) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; rr(sx - 1.5, ty - 1.5, sw + 3, sw + 3, 5); ctx.stroke(); }
    else { ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; rr(sx, ty, sw, sw, 4); ctx.stroke(); }
    p._sw.push({ x: sx, y: ty, s: sw, c }); sx += sw + sg;
  }
  // buton golire
  const cb = { x: p.x + p.w - 50, y: ty, w: 38, h: sw }; p._clear = cb;
  const chov = pointer.x >= cb.x && pointer.x <= cb.x + cb.w && pointer.y >= cb.y && pointer.y <= cb.y + cb.h;
  ctx.fillStyle = chov ? "#5a2b2b" : "#2b2e3a"; rr(cb.x, cb.y, cb.w, cb.h, 5); ctx.fill();
  ctx.fillStyle = "#e8ecff"; ctx.font = "13px 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🗑", cb.x + cb.w / 2, ty + sw / 2 + 1); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  // pânză
  const c = { x: p.x + 10, y: ty + sw + 8, w: p.w - 20, h: p.y + p.h - (ty + sw + 8) - 10 }; p._canvas = c;
  ctx.fillStyle = "#14151f"; ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
  ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const stroke = (st) => {
    if (!st.pts.length) return;
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.w || 3;
    if (st.pts.length === 1) { ctx.beginPath(); ctx.arc(c.x + st.pts[0].x, c.y + st.pts[0].y, (st.w || 3) / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(c.x + st.pts[0].x, c.y + st.pts[0].y);
    for (let i = 1; i < st.pts.length; i++) ctx.lineTo(c.x + st.pts[i].x, c.y + st.pts[i].y);
    ctx.stroke();
  };
  for (const st of p.strokes) stroke(st);
  if (p.cur) stroke(p.cur);
  ctx.restore();
  ctx.restore();
}

// ---- Cronometru ----
function openStopwatch() {
  const y = 120, w = 300, h = 220;
  stopwatchWin = { x: Math.max(12, Math.round(W / 2 - w / 2) - 180), y, w, h, running: false, accMs: 0, startT: 0 };
}
function closeStopwatch() { stopwatchWin = null; }
function swElapsed(s) { return s.accMs + (s.running ? performance.now() - s.startT : 0); }
function fmtTime(ms) {
  const total = Math.floor(ms), m = Math.floor(total / 60000), sec = Math.floor((total % 60000) / 1000), cs = Math.floor((total % 1000) / 10);
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0") + "." + String(cs).padStart(2, "0");
}
function swBtn(id) {
  const s = stopwatchWin; if (!s) return;
  if (id === "start") { if (!s.running) { s.startT = performance.now(); s.running = true; } }
  else if (id === "stop") { if (s.running) { s.accMs += performance.now() - s.startT; s.running = false; } }
  else if (id === "reset") { s.accMs = 0; s.running = false; }
}
function drawStopwatch() {
  if (!stopwatchWin) return;
  const s = stopwatchWin;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#202124"; rr(s.x, s.y, s.w, s.h, 12); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#35363a"; rr(s.x, s.y, s.w, 28, 12); ctx.fill(); ctx.fillRect(s.x, s.y + 16, s.w, 12);
  ctx.fillStyle = "#e8ecff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.fillText("⏱ Cronometru", s.x + 12, s.y + 19);
  const xb = { x: s.x + s.w - 24, y: s.y + 6, s: 18 }; s._xb = xb;
  const hov = pointer.x >= xb.x && pointer.x <= xb.x + xb.s && pointer.y >= xb.y && pointer.y <= xb.y + xb.s;
  ctx.fillStyle = hov ? "#e81123" : "#4a4b50"; rr(xb.x, xb.y, xb.s, xb.s, 5); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb.x + 5, xb.y + 5); ctx.lineTo(xb.x + xb.s - 5, xb.y + xb.s - 5); ctx.moveTo(xb.x + xb.s - 5, xb.y + 5); ctx.lineTo(xb.x + 5, xb.y + xb.s - 5); ctx.stroke();
  ctx.fillStyle = s.running ? "#7ee6a0" : "#e8ecff"; ctx.font = "bold 32px 'Consolas', monospace"; ctx.textAlign = "center";
  ctx.fillText(fmtTime(swElapsed(s)), s.x + s.w / 2, s.y + 92);
  const by = s.y + s.h - 44, bw = (s.w - 40) / 3, bh = 32;
  s._btns = [
    { id: "start", label: "▶ Start", col: "#2e7d46", x: s.x + 12, y: by, w: bw, h: bh },
    { id: "stop", label: "⏹ Stop", col: "#a83232", x: s.x + 16 + bw, y: by, w: bw, h: bh },
    { id: "reset", label: "↺ Reset", col: "#3a3f52", x: s.x + 20 + bw * 2, y: by, w: bw, h: bh },
  ];
  ctx.textBaseline = "middle";
  for (const b of s._btns) { ctx.fillStyle = b.col; rr(b.x, b.y, b.w, b.h, 8); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2); }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
function openChrome(auto) {
  const y = 80, w = Math.min(660, W - 40), h = Math.min(440, groundY - y - 40);
  const vid = pick(VIDEOS);
  browserWin = { x: Math.round(W / 2 - w / 2), y, w, h, title: vid.t, vtype: vid.v, views: (Math.random() * 9 + 0.3).toFixed(1) + "M", t0: frame, dur: rand(780, 1320) }; // videoul ține ~13-22s apoi se închide
  const avail = agents.filter(a => !a.isPlayer && (a.state === "walk" || a.state === "idle" || a.state === "scared"));
  avail.forEach((a, i) => { a.state = "watch"; a.lie = 0; a.sleepPhase = null; a.jumping = false; if (a.opponent) a.endFight(); a.watchTarget = browserWin.x + w * 0.12 + i * (w * 0.76) / Math.max(1, avail.length - 1); });
}
function closeChrome() {
  browserWin = null;
  agents.forEach(a => { if (a.state === "watch") { a.state = "walk"; a.targetX = null; a.stateTimer = rand(40, 120); a.speak(pick(["Gata!", "Tare a fost!", "Mai vreau!"]), 70); } });
}
function triggerBuild() {
  const cands = agents.filter(x => !x.isPlayer && (x.state === "walk" || x.state === "idle") && x.builtCount < 2);
  if (!cands.length || structures.length >= 8) return;
  const a = pick(cands), type = pick(["house", "tower", "tree", "campfire"]);
  a.state = "build"; a.buildDur = rand(340, 480); a.buildTimer = a.buildDur;
  const s = { x: a.x, color: a.c.color, progress: 0, type }; structures.push(s); a.building = s; a.builtCount++;
  a.speak(pick(["Construiesc!", "Minecraft!"]), 120);
}
function triggerRandomFight() {
  const av = agents.filter(x => !x.isPlayer && (x.state === "walk" || x.state === "idle"));
  if (av.length < 2) return;
  const a = pick(av), b = pick(av.filter(x => x !== a));
  if (b) startFightBetween(a, b);
}
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

function miniStick(x, gy, h, color, face, pose, t) {
  ctx.save(); ctx.translate(x, gy); ctx.scale(face, 1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, h * 0.06); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const hip = -h * 0.45, sh = -h * 0.78, r = h * 0.13, hy = sh - h * 0.08 - r;
  const ph = pose === "run" ? t * 0.4 : t * 0.12, sw = (pose === "run") ? Math.sin(ph) * h * 0.18 : Math.sin(ph) * h * 0.05;
  if (pose === "tuck") { ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(h * 0.14, hip + h * 0.1); ctx.moveTo(0, hip); ctx.lineTo(-h * 0.14, hip + h * 0.1); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(-h * 0.12 + sw, 0); ctx.moveTo(0, hip); ctx.lineTo(h * 0.12 - sw, 0); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(0, sh); ctx.stroke();
  if (pose === "punch") { ctx.beginPath(); ctx.moveTo(0, sh + 3); ctx.lineTo(h * 0.32, sh); ctx.moveTo(0, sh + 3); ctx.lineTo(-h * 0.12, sh + h * 0.14); ctx.stroke(); }
  else if (pose === "recoil") { ctx.beginPath(); ctx.moveTo(0, sh + 3); ctx.lineTo(-h * 0.2, sh - h * 0.06); ctx.moveTo(0, sh + 3); ctx.lineTo(-h * 0.12, sh + h * 0.14); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(0, sh + 3); ctx.lineTo(-h * 0.14 + sw, sh + h * 0.18); ctx.moveTo(0, sh + 3); ctx.lineTo(h * 0.14 - sw, sh + h * 0.18); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, hy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// mini-video diferit în funcție de titlu
function drawVideoContent(vx, vy, vw, vh, type, t) {
  ctx.save(); ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
  const cx = vx + vw / 2, cy = vy + vh / 2;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (type === "music") {
    const bars = 18, bw = vw / bars * 0.62;
    for (let i = 0; i < bars; i++) { const bh = (0.2 + 0.8 * Math.abs(Math.sin(t * 0.15 + i * 0.55))) * vh * 0.55; ctx.fillStyle = `hsl(${(i * 20 + t) % 360},70%,55%)`; ctx.fillRect(vx + i * vw / bars + vw / bars * 0.19, cy - bh / 2, bw, bh); }
    ctx.fillStyle = "#fff"; ctx.font = `${vh * 0.3}px serif`; ctx.fillText("🎧", cx, cy);
  } else if (type === "fight") {
    const gy = cy + vh * 0.26, hit = Math.sin(t * 0.18) > 0.6;
    miniStick(cx - vw * 0.15, gy, vh * 0.5, "#4aa3ff", 1, hit ? "punch" : "idle", t);
    miniStick(cx + vw * 0.15, gy, vh * 0.5, "#ff5555", -1, hit ? "recoil" : "idle", t);
    if (hit) { ctx.fillStyle = "#ffd23f"; ctx.font = `${vh * 0.24}px serif`; ctx.fillText("💥", cx, gy - vh * 0.22); }
  } else if (type === "build") {
    const cols = 6, rows = 5, per = 16, cyc = cols * rows * per + 60, shown = Math.floor((t % cyc) / per);
    const B = Math.min(vw / (cols + 1), vh / (rows + 1)) * 0.92, x0 = cx - cols * B / 2, y0 = cy + rows * B / 2;
    for (let k = 0; k < Math.min(shown, cols * rows); k++) { const r = Math.floor(k / cols), c = k % cols; ctx.fillStyle = (r === rows - 1) ? "#5aab3a" : "#7a5a3a"; ctx.fillRect(x0 + c * B, y0 - (r + 1) * B, B - 1, B - 1); }
  } else if (type === "run") {
    const gy = cy + vh * 0.26; ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(vx, gy); ctx.lineTo(vx + vw, gy); ctx.stroke();
    for (let i = 0; i < 9; i++) { const dx = vx + ((i * vw / 9 - (t * 4) % (vw / 9))); ctx.strokeStyle = "#777"; ctx.beginPath(); ctx.moveTo(dx, gy + 5); ctx.lineTo(dx + 10, gy + 5); ctx.stroke(); }
    miniStick(cx, gy, vh * 0.5, "#7ee6a0", 1, "run", t);
    ctx.fillStyle = "#ffde3b"; ctx.font = `bold ${vh * 0.13}px monospace`; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText((t / 60).toFixed(2) + "s", vx + vw - 6, vy + 6);
  } else if (type === "cat") {
    const by = Math.sin(t * 0.1) * 4, e = vh * 0.28; ctx.save(); ctx.translate(cx, cy + by);
    ctx.fillStyle = "#e0a24a"; ctx.beginPath(); ctx.moveTo(-e * 0.7, -e * 0.5); ctx.lineTo(-e * 0.45, -e * 1.15); ctx.lineTo(-e * 0.1, -e * 0.65); ctx.closePath(); ctx.moveTo(e * 0.7, -e * 0.5); ctx.lineTo(e * 0.45, -e * 1.15); ctx.lineTo(e * 0.1, -e * 0.65); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, e, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-e * 0.35, -e * 0.05, 3, 0, 7); ctx.arc(e * 0.35, -e * 0.05, 3, 0, 7); ctx.fill();
    ctx.fillStyle = "#f9a"; ctx.beginPath(); ctx.moveTo(-4, e * 0.18); ctx.lineTo(4, e * 0.18); ctx.lineTo(0, e * 0.34); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#eee"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e * 0.2, e * 0.2); ctx.lineTo(e * 0.9, e * 0.1); ctx.moveTo(-e * 0.2, e * 0.2); ctx.lineTo(-e * 0.9, e * 0.1); ctx.stroke();
    ctx.restore();
  } else if (type === "stunt") {
    const p = (t % 170) / 170, sx = vx + p * vw, sy = cy + Math.sin(p * Math.PI) * (-vh * 0.32);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(p * Math.PI * 4); miniStick(0, vh * 0.15, vh * 0.42, "#ff8c1a", 1, "tuck", t); ctx.restore();
    ctx.fillStyle = "#fff"; ctx.font = `${vh * 0.18}px serif`; ctx.textBaseline = "top"; ctx.fillText("😱", vx + vw * 0.5, vy + 4);
  } else if (type === "facts") {
    const on = Math.sin(t * 0.2) > 0; ctx.fillStyle = on ? "#ffd23f" : "#5a5a45"; ctx.font = `${vh * 0.42}px serif`; ctx.fillText("💡", cx, cy - vh * 0.06);
    ctx.fillStyle = "#e8ecff"; ctx.font = `bold ${vh * 0.2}px 'Segoe UI', sans-serif`; ctx.fillText("Fapt #" + (1 + Math.floor(t / 40) % 10), cx, cy + vh * 0.34);
  } else if (type === "reaction") {
    const sh = Math.sin(t * 0.15) > 0.3; ctx.font = `${vh * 0.55}px serif`; ctx.fillText(sh ? "😮" : "🙂", cx, cy);
  } else if (type === "countdown") {
    const n = Math.max(1, 5 - Math.floor((t % 300) / 60)); ctx.fillStyle = "#ff5555"; ctx.font = `bold ${vh * 0.6}px 'Segoe UI', sans-serif`; ctx.fillText(String(n), cx, cy);
  } else if (type === "redstone") {
    const wy = cy; ctx.strokeStyle = "#5a0f0f"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(vx + 12, wy); ctx.lineTo(vx + vw - 12, wy); ctx.stroke();
    const n = 8; for (let i = 0; i < n; i++) { const px = vx + 12 + (i + 0.5) * (vw - 24) / n, lit = (Math.floor(t * 0.12) % n) === i; ctx.fillStyle = lit ? "#ff3b3b" : "#7a1a1a"; ctx.beginPath(); ctx.arc(px, wy, 6, 0, Math.PI * 2); ctx.fill(); if (lit) { ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; } }
  } else {
    ctx.fillStyle = "#fff"; ctx.font = `${vh * 0.3}px serif`; ctx.fillText("▶", cx, cy);
  }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawBrowser() {
  if (!browserWin) return;
  const b = browserWin;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#202124"; rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#35363a"; rr(b.x, b.y, b.w, 30, 12); ctx.fill(); ctx.fillRect(b.x, b.y + 18, b.w, 12);
  ctx.fillStyle = "#202124"; rr(b.x + 10, b.y + 7, 150, 22, 7); ctx.fill();
  ctx.fillStyle = "#e8ecff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.fillText("▶ YouTube", b.x + 20, b.y + 22);
  const xb = { x: b.x + b.w - 26, y: b.y + 7, s: 20 }; b._xb = xb;
  const hover = pointer.x >= xb.x && pointer.x <= xb.x + xb.s && pointer.y >= xb.y && pointer.y <= xb.y + xb.s;
  ctx.fillStyle = hover ? "#e81123" : "#4a4b50"; rr(xb.x, xb.y, xb.s, xb.s, 5); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xb.x + 6, xb.y + 6); ctx.lineTo(xb.x + xb.s - 6, xb.y + xb.s - 6); ctx.moveTo(xb.x + xb.s - 6, xb.y + 6); ctx.lineTo(xb.x + 6, xb.y + xb.s - 6); ctx.stroke();
  ctx.fillStyle = "#2a2b2e"; rr(b.x + 10, b.y + 36, b.w - 20, 22, 11); ctx.fill();
  ctx.fillStyle = "#9aa0b0"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.fillText("🔒 youtube.com/watch — " + b.title.slice(0, 28), b.x + 22, b.y + 51);
  const vx = b.x + 12, vy = b.y + 66, vw = b.w - 24, vh = b.h - 66 - 42;
  ctx.fillStyle = "#000"; ctx.fillRect(vx, vy, vw, vh);
  drawVideoContent(vx, vy, vw, vh, b.vtype, frame - b.t0);
  const prog = clamp((frame - b.t0) / b.dur, 0, 1);
  ctx.fillStyle = "#555"; ctx.fillRect(vx, vy + vh - 4, vw, 4); ctx.fillStyle = "#ff0000"; ctx.fillRect(vx, vy + vh - 4, vw * prog, 4);
  ctx.fillStyle = "#e8ecff"; ctx.font = "bold 14px 'Segoe UI', sans-serif"; ctx.fillText(b.title, b.x + 12, vy + vh + 22);
  ctx.fillStyle = "#9aa0b0"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.fillText("▶ " + b.views + " vizualizări · gașca se uită", b.x + 12, vy + vh + 38);
  ctx.restore();
}

// dublu-click pe unul, apoi pe altul → se luptă
function fightSelect(a) {
  if (a.away || a.state === "held" || a.state === "thrown") return;
  if (challenger && (challenger.away || challenger.state === "held" || challenger.state === "thrown")) challenger = null;
  if (challenger === a) { challenger = null; a.speak("...", 40); return; }
  if (!challenger) { challenger = a; a.lie = 0; a.sleepPhase = null; a.speak("Cine mă provoacă?", 100); }
  else { startFightBetween(challenger, a); challenger = null; }
}
function startFightBetween(a, b) {
  for (const x of [a, b]) { x.lie = 0; x.sleepPhase = null; x.jumping = false; x.building = null; if (x.opponent) x.endFight(); }
  a.startFight(b);
  b.opponent = a; b.state = "fight"; b.stateTimer = a.stateTimer; b.attacker = false; b.speak(pick(b.c.fightLines), 90);
}
// touch: tap = lovitură (fără drag pt. simplitate)
window.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t) { pointer.x = t.clientX; pointer.y = t.clientY; const a = nearestAgent(t.clientX, t.clientY); if (a) a.getHit(t.clientX); } }, { passive: true });
window.addEventListener("contextmenu", (e) => { e.preventDefault(); if (minecraftWin && e.clientX >= minecraftWin.x && e.clientX <= minecraftWin.x + minecraftWin.w && e.clientY >= minecraftWin.y && e.clientY <= minecraftWin.y + minecraftWin.h) { mcPlaceAt(e.clientX, e.clientY); return; } const a = nearestAgent(e.clientX, e.clientY); if (a && window.openChat) window.openChat(a); });

// aventură
function avail(a) { return !a.away && !a.isPlayer && !a.chatting && a.state !== "sleep" && a.state !== "leaving" && a.state !== "held" && a.state !== "thrown" && a.state !== "scared"; }
function startAdventure() {
  const orange = agents.find(a => a.c.id === "orange");
  if (!orange || !avail(orange)) return;
  const others = agents.filter(a => a !== orange && avail(a));
  if (others.length < 2) return; // lasă mereu 1-2 acasă
  const stay = Math.min(others.length - 1, 1 + (Math.random() < 0.5 ? 1 : 0)); // 1 sau 2 rămân
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  const followers = shuffled.slice(0, others.length - stay);
  if (followers.length === 0) return;
  const side = Math.random() < 0.5 ? -1 : 1, exitX = side < 0 ? -120 : W + 120;
  const PLACES = ["Muntele Pixel", "Peștera Redstone", "Pădurea Întunecată", "Insula Cuburilor", "Tărâmul Animatorului", "Deșertul de Nisip", "Castelul din Nori"];
  const ACTS = ["caută comori", "luptă cu un dragon", "explorează o peșteră", "construiesc o bază secretă", "salvează un cub pierdut", "adună diamante"];
  expedition = { place: pick(PLACES), activity: pick(ACTS), duration: rand(3600, 18000) }; // 1-5 min
  orange.speak("Aventură!", 160); if (orange.opponent) orange.endFight();
  followers.forEach(f => { if (f.opponent) f.endFight(); f.speak("Hai!", 130); });
  [orange, ...followers].forEach((a, i) => setTimeoutLeave(a, exitX, 30 + i * 18));
}
const _pending = [];
function setTimeoutLeave(a, exitX, delay) { _pending.push({ a, exitX, t: delay }); }

window.recallAdventurers = function () {
  _pending.length = 0;
  let n = 0;
  for (const a of agents) {
    if (a.away) { a.awayTimer = 1; n++; }
    else if (a.state === "leaving") { a.returnFromAdventure(W); n++; }
  }
  expedition = null;
  return n;
};

// întoarce un singur membru (după nume)
window.recallOne = function (name) {
  const a = agents.find(x => x.c.name === name && (x.away || x.state === "leaving"));
  if (!a) return false;
  for (let i = _pending.length - 1; i >= 0; i--) if (_pending[i].a === a) _pending.splice(i, 1);
  if (a.away) a.awayTimer = 1;
  else if (a.state === "leaving") a.returnFromAdventure(W);
  if (!agents.some(x => x.adventure && (x.away || x.state === "leaving"))) expedition = null;
  return true;
};

// info expediție pentru buton
window.getExpedition = function () {
  const members = agents.filter(a => a.adventure && (a.away || a.state === "leaving"));
  if (members.length === 0 || !expedition) return { active: false };
  const awayM = members.filter(m => m.away);
  const rem = awayM.length ? Math.max(...awayM.map(m => m.awayTimer)) : null;
  return {
    active: true,
    names: members.map(m => m.c.name),
    members: members.map(m => ({ name: m.c.name, color: m.c.color, hollowHead: !!m.c.hollowHead, crown: !!m.c.crown })),
    place: expedition.place, activity: expedition.activity,
    remaining: rem === null ? null : Math.round(rem / 60),
  };
};

window.getAutoAdventure = function () { return autoAdventure; };
window.setAutoAdventure = function (on) { autoAdventure = !!on; return autoAdventure; };

// trimite gașca în expediție manual (din buton)
window.triggerExpedition = function () {
  const already = agents.some(a => a.adventure && (a.away || a.state === "leaving"));
  if (already) return "already";
  const before = _pending.length;
  startAdventure();
  adventureCd = rand(3600, 9000);
  return _pending.length > before ? "ok" : "busy";
};

// spawn stickman controlat de tine
function spawnPlayer() {
  if (player) { // vechiul devine AI — primește o culoare (doar cel controlat rămâne gri)
    player.isPlayer = false; player.state = "walk"; player.targetX = null;
    player.c = { ...player.c, color: pick(["#FF8C1A", "#E63329", "#46B84B", "#3B7DD8", "#F5C518", "#9b4dff", "#E8A317"]) };
  }
  playerCount++;
  const c = { id: "player" + playerCount, name: "Tu", color: "#aab0be", hollowHead: false, headR: 20, persona: "jucătorul controlat de tastatură (A/D/săgeți + Space).", chatter: ["Sunt tu!", "Hai!", "Wooo!"], hitLines: ["Au!", "Hei!"], fightLines: ["Ia asta!"] };
  player = new Agent(c, W);
  player.isPlayer = true; player.x = W / 2; player.speed = 1.0;
  agents.push(player);
}
// creează un stickman nou (comanda print(stickman) din Notepad)
function spawnStickman() {
  if (agents.length >= 60) return false; // plafon ca do(500) să nu îngheţe
  const a = new Agent(pick(CHARACTERS), W || window.innerWidth);
  a.state = "walk"; a.targetX = null;
  agents.push(a);
  return true;
}
// șterge un stickman (comanda unprint(stickman)) — cel mai recent adăugat, nu jucătorul
function removeStickman() {
  for (let i = agents.length - 1; i >= 0; i--) { if (!agents[i].isPlayer) { agents.splice(i, 1); return true; } }
  return false;
}
// scoate toți jucătorii spawnați (controlat + clone)
function removePlayers() {
  for (let i = agents.length - 1; i >= 0; i--) if (String(agents[i].c.id).startsWith("player")) agents.splice(i, 1);
  player = null;
}

// tastatură: Notepad deschis → scrii în el; altfel comenzi joc (R/H/Space/A/D/săgeți)
window.addEventListener("keydown", (e) => {
  if (notepadWin) {
    const n = notepadWin; if (n.cursor === undefined) n.cursor = n.text.length;
    if (e.ctrlKey && (e.key === "e" || e.key === "E")) { runPython(n.text); e.preventDefault(); return; } // Ctrl+E = rulează
    if (e.key === "Backspace") { if (n.cursor > 0) { n.text = n.text.slice(0, n.cursor - 1) + n.text.slice(n.cursor); n.cursor--; } e.preventDefault(); }
    else if (e.key === "Enter") { n.text = n.text.slice(0, n.cursor) + "\n" + n.text.slice(n.cursor); n.cursor++; e.preventDefault(); }
    else if (e.key === "Tab") { n.text = n.text.slice(0, n.cursor) + "  " + n.text.slice(n.cursor); n.cursor += 2; e.preventDefault(); }
    else if (e.key === "Escape") { closeNotepad(); }
    else if (e.key === "ArrowLeft") { n.cursor = Math.max(0, n.cursor - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { n.cursor = Math.min(n.text.length, n.cursor + 1); e.preventDefault(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { n.text = n.text.slice(0, n.cursor) + e.key + n.text.slice(n.cursor); n.cursor++; e.preventDefault(); }
    return;
  }
  const k = e.key.toLowerCase();
  if (minecraftWin) { // în Minecraft controlezi personajul tău
    if (k === "escape") { closeMinecraft(); return; }
    if (k === " " || k === "spacebar") { const pm = minecraftWin.mobs.find(mo => mo.isPlayer); if (pm) pm.wantJump = true; e.preventDefault(); return; }
    if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") { keys.add(k); if (k.startsWith("arrow")) e.preventDefault(); }
    return;
  }
  if (k === "r") { spawnPlayer(); return; }
  if (k === "t") { removePlayers(); return; }
  if (k === "h") { showHitboxes = !showHitboxes; return; }
  if (k === "g") { fxLevel = fxLevel < 0.05 ? 0.1 : (fxLevel < 0.2 ? 0.35 : (fxLevel < 0.6 ? 0.7 : 0)); return; } // intensitate shader WebGL
  if (k === " " || k === "spacebar") { if (player && !player.jumping && player.jumpCd <= 0) { player.jumping = true; player.jumpT = 0; } e.preventDefault(); return; }
  if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") { keys.add(k); if (k.startsWith("arrow")) e.preventDefault(); }
});
window.addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); });
function drawHitboxes() {
  ctx.save();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#fff"; ctx.font = "11px monospace"; ctx.textAlign = "center";
  for (const a of agents) {
    if (a.away) continue;
    const sleeping = a.state === "sleep" && a.lie > 0.3;
    const half = sleeping ? 74 : 19;
    const bodyH = sleeping ? 34 : (104 + 2 * a.c.headR);
    let cx = a.x, baseY = groundY;
    if (a.state === "held") { cx = pointer.x; baseY = Math.min(pointer.y, groundY); }
    else if (a.state === "thrown") { baseY = groundY - a.tz; }
    else if (a.state === "climb" || a.state === "onwin" || a.state === "onstruct" || a.state === "ondraw" || (a.state === "gopaint" && a.tz > 0)) { baseY = groundY - a.tz; }
    else if (a.jumping) { baseY = groundY - Math.sin(a.jumpT * Math.PI) * 155; } // hitboxul sare cu modelul
    if (a.state === "thrown") { // hitboxul se rotește cu modelul
      ctx.save(); ctx.translate(cx, baseY); ctx.rotate(a.tangle);
      ctx.strokeRect(-half, -bodyH, half * 2, bodyH); ctx.fillText(a.c.name, 0, -bodyH - 5);
      ctx.restore();
    } else {
      ctx.strokeRect(cx - half, baseY - bodyH, half * 2, bodyH);
      ctx.fillText(a.c.name, cx, baseY - bodyH - 5);
    }
  }
  // coliziunea desenelor: cutia + suprafața de sus (galben) pe care aterizează stickmanii
  for (const d of drawings) {
    const top = d.cy - d.s, hw = d.s;
    ctx.globalAlpha = 0.9; ctx.strokeStyle = "#3ad1ff"; ctx.lineWidth = 1.5;
    ctx.strokeRect(d.cx - hw, top, hw * 2, d.s * 2);
    ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(d.cx - hw, top); ctx.lineTo(d.cx + hw, top); ctx.stroke();
    ctx.fillStyle = "#ffe14d"; ctx.font = "10px monospace"; ctx.fillText("desen", d.cx, top - 4);
  }
  ctx.restore();
}

function maybeStartFight() {
  if (fightCheck-- > 0) return;
  fightCheck = rand(500, 1100);
  const free = agents.filter(a => !a.chatting && !a.away && !a.isPlayer && (a.state === "walk" || a.state === "idle"));
  if (free.length < 2) return;
  for (let i = 0; i < free.length; i++)
    for (let j = i + 1; j < free.length; j++)
      if (Math.abs(free[i].x - free[j].x) < 340 && Math.random() < 0.6) {
        free[i].startFight(free[j]);
        free[j].opponent = free[i]; free[j].state = "fight"; free[j].stateTimer = free[i].stateTimer; free[j].attacker = false;
        return;
      }
}

// pământul = taskbar Windows cu iconițe (Search, Chrome, Minecraft, League of Legends)
function drawTaskbar() {
  const bh = H - groundY;
  ctx.fillStyle = "#191b24"; ctx.fillRect(0, groundY, W, bh);
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
  const s = Math.min(48, bh - 30);
  const icons = [["search", drawSearchIcon], ["chrome", drawChromeIcon], ["minecraft", drawMinecraftIcon], ["lol", drawLoLIcon], ["stopwatch", drawStopwatchIcon], ["notepad", drawNotepadIcon], ["paint", drawPaintIcon]];
  const gap = s * 0.55;
  const totalW = icons.length * s + (icons.length - 1) * gap;
  const cy = groundY + bh / 2 + 2;
  let cx = W / 2 - totalW / 2 + s / 2;
  taskIcons = [];
  for (const [name, fn] of icons) { fn(cx, cy, s); taskIcons.push({ name, cx, cy, s }); cx += s + gap; }
  // Start (stânga)
  const ss = s * 0.72, sx = 24 + ss / 2;
  drawStartIcon(sx, cy, ss); taskIcons.push({ name: "start", cx: sx, cy, s: ss });
  // ceas (dreapta)
  drawClock(W - 14, cy);
}
function drawStartIcon(cx, cy, s) {
  const q = s * 0.4, g = s * 0.12; ctx.fillStyle = "#4aa3ff";
  const x0 = cx - q - g / 2, y0 = cy - q - g / 2;
  ctx.fillRect(x0, y0, q, q); ctx.fillRect(x0 + q + g, y0, q, q);
  ctx.fillRect(x0, y0 + q + g, q, q); ctx.fillRect(x0 + q + g, y0 + q + g, q, q);
}
function drawClock(rx, cy) {
  const d = new Date();
  const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  ctx.save(); ctx.textAlign = "right";
  ctx.fillStyle = "#e8ecff"; ctx.font = "13px 'Segoe UI', sans-serif"; ctx.fillText(time, rx, cy - 1);
  ctx.fillStyle = "#9aa0b0"; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.fillText(date, rx, cy + 14);
  ctx.restore();
}
function iconBg(cx, cy, s, fill) { ctx.fillStyle = fill; ctx.beginPath(); if (ctx.roundRect) { ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.22); } else { ctx.rect(cx - s / 2, cy - s / 2, s, s); } ctx.fill(); }
function drawSearchIcon(cx, cy, s) {
  iconBg(cx, cy, s, "#2b2e3a");
  const r = s * 0.2; ctx.strokeStyle = "#e8ecff"; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx - s * 0.07, cy - s * 0.07, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.08, cy + s * 0.08); ctx.lineTo(cx + s * 0.22, cy + s * 0.22); ctx.stroke();
}
function drawChromeIcon(cx, cy, s) {
  const r = s / 2 * 0.94; ctx.save(); ctx.translate(cx, cy);
  const cols = ["#ea4335", "#34a853", "#fbbc05"];
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, (i * 120 - 90) * Math.PI / 180, ((i + 1) * 120 - 90) * Math.PI / 180); ctx.closePath(); ctx.fillStyle = cols[i]; ctx.fill(); }
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4285f4"; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawMinecraftIcon(cx, cy, s) {
  const q = s * 0.9, x0 = cx - q / 2, y0 = cy - q / 2;
  ctx.fillStyle = "#7a5a3a"; ctx.fillRect(x0, y0, q, q);           // pământ
  ctx.fillStyle = "#5aab3a"; ctx.fillRect(x0, y0, q, q * 0.34);     // iarbă
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  const p = q / 4;
  ctx.fillRect(x0 + p, y0 + q * 0.45, p * 0.8, p * 0.8);
  ctx.fillRect(x0 + p * 2.4, y0 + q * 0.66, p * 0.8, p * 0.8);
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x0 + p * 2, y0 + q * 0.05, p * 0.8, p * 0.6);
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, q, q);
}
function drawLoLIcon(cx, cy, s) {
  iconBg(cx, cy, s, "#091428");
  ctx.strokeStyle = "#c8963c"; ctx.lineWidth = Math.max(1.5, s * 0.04);
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2, s * 0.2); ctx.stroke(); }
  ctx.fillStyle = "#c89b3c"; ctx.font = `bold ${Math.round(s * 0.4)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("LoL", cx, cy + 1);
  ctx.textBaseline = "alphabetic";
}
function drawStopwatchIcon(cx, cy, s) {
  iconBg(cx, cy, s, "#2b2e3a");
  const r = s * 0.28, ccy = cy + s * 0.05;
  ctx.strokeStyle = "#e8ecff"; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, ccy, r, 0, Math.PI * 2); ctx.stroke();          // corp
  ctx.beginPath(); ctx.moveTo(cx - s * 0.08, ccy - r - s * 0.08); ctx.lineTo(cx + s * 0.08, ccy - r - s * 0.08); ctx.stroke(); // buton sus
  ctx.beginPath(); ctx.moveTo(cx, ccy - r - s * 0.02); ctx.lineTo(cx, ccy - r - s * 0.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, ccy); ctx.lineTo(cx, ccy - r * 0.6); ctx.moveTo(cx, ccy); ctx.lineTo(cx + r * 0.5, ccy + r * 0.2); ctx.stroke(); // ace
}
function drawNotepadIcon(cx, cy, s) {
  const w = s * 0.62, h = s * 0.78, x0 = cx - w / 2, y0 = cy - h / 2;
  ctx.fillStyle = "#f5f5ee"; ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = "#8a8a7a"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, w, h);
  ctx.strokeStyle = "#9fb7d8"; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) { const ly = y0 + h * (i / 5); ctx.beginPath(); ctx.moveTo(x0 + 3, ly); ctx.lineTo(x0 + w - 3, ly); ctx.stroke(); }
  // creion
  ctx.strokeStyle = "#e8a33a"; ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx + w * 0.25, cy + h * 0.35); ctx.lineTo(cx + w * 0.55, cy - h * 0.35); ctx.stroke();
}

function drawPaintIcon(cx, cy, s) {
  iconBg(cx, cy, s, "#f2ede2");
  const dots = [["#E63329", -0.19, -0.17], ["#F5C518", 0.17, -0.19], ["#3B7DD8", -0.21, 0.11], ["#46B84B", 0.13, 0.13]];
  for (const [c, dx, dy] of dots) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + dx * s, cy + dy * s, s * 0.09, 0, Math.PI * 2); ctx.fill(); }
  // pensulă
  ctx.strokeStyle = "#7a5a3a"; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx + s * 0.05, cy + s * 0.05); ctx.lineTo(cx + s * 0.28, cy + s * 0.3); ctx.stroke();
  ctx.strokeStyle = "#c0392b"; ctx.lineWidth = Math.max(3, s * 0.08);
  ctx.beginPath(); ctx.moveTo(cx + s * 0.28, cy + s * 0.3); ctx.lineTo(cx + s * 0.34, cy + s * 0.36); ctx.stroke();
}

function blk(x, y, s, fill) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

// construcții din blocuri stil Minecraft, cresc de jos în sus cu progresul
function drawStructure(s) {
  const B = 15 * (s.scale || 1), x = s.x, base = s.by || groundY, p = s.progress, col = s.color;
  const put = (cx, cy, fill) => blk(x + cx * B - B / 2, base - (cy + 1) * B, B, fill);

  if (s.type === "house") {
    const cols = 8, rows = 6, maxRow = 9, shown = Math.ceil(p * maxRow);
    for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
      if (ry >= shown) continue;
      if (ry < 2 && (cx === 3 || cx === 4)) continue; // ușă
      const border = (ry === 0 || cx === 0 || cx === cols - 1 || ry === rows - 1);
      put(cx - cols / 2, ry, shade(col, border ? 0.95 : 0.6));
    }
    for (const [ry, hw] of [[6, 3], [7, 2], [8, 1]]) { if (ry >= shown) continue; for (let cx = -hw; cx < hw; cx++) put(cx, ry, shade(col, 0.78)); }
  }
  else if (s.type === "tower") {
    const cols = 4, rows = 10, maxRow = 11, shown = Math.ceil(p * maxRow);
    for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
      if (ry >= shown) continue;
      if (ry === 5 && (cx === 1 || cx === 2)) continue; // fereastră
      const border = (ry === 0 || cx === 0 || cx === cols - 1);
      put(cx - cols / 2, ry, shade(col, border ? 0.95 : 0.6));
    }
    if (shown > rows) for (let cx = 0; cx < cols; cx++) if (cx % 2 === 0) put(cx - cols / 2, rows, shade(col, 0.95));
  }
  else if (s.type === "tree") {
    const shown = Math.ceil(p * 9);
    for (let ry = 0; ry < 4; ry++) if (ry < shown) put(0, ry, shade("#6b4a2b", ry % 2 ? 0.95 : 0.7));
    const blob = [[-2, 4], [-1, 4], [0, 4], [1, 4], [-2, 5], [-1, 5], [0, 5], [1, 5], [-2, 6], [-1, 6], [0, 6], [1, 6], [-1, 7], [0, 7]];
    for (const [cx, cy] of blob) if (cy < shown) put(cx, cy, shade("#3fa845", ((cx + cy) & 1) ? 0.9 : 0.65));
  }
  else if (s.type === "campfire") {
    if (p > 0.2) { put(-1, 0, shade("#6b4a2b", 0.85)); put(0, 0, shade("#6b4a2b", 0.6)); put(1, 0, shade("#6b4a2b", 0.95)); }
    if (s.out) { // stins cu apă → abur, dispare
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.outTimer / 300);
      ctx.fillStyle = "#3b7dd8"; ctx.beginPath(); ctx.ellipse(x, base - 6, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(220,230,245,0.55)";
      for (let i = 0; i < 3; i++) { const sy = base - B - ((frame * 1.5 + i * 22) % 44); ctx.beginPath(); ctx.arc(x + (i - 1) * 8, sy, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    } else if (p > 0.4) {
      const rp = Math.min(1, (p - 0.4) / 0.6), fl = (30 + Math.sin(frame * 0.3) * 8) * rp, fb = base - B;
      ctx.save();
      ctx.fillStyle = "#ff9a2e"; ctx.beginPath(); ctx.moveTo(x - 14, fb); ctx.quadraticCurveTo(x - 4, fb - fl * 0.6, x, fb - fl); ctx.quadraticCurveTo(x + 4, fb - fl * 0.6, x + 14, fb); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.moveTo(x - 6, fb); ctx.quadraticCurveTo(x, fb - fl * 0.75, x + 6, fb); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

function drawParticles() {
  ctx.save();
  ctx.fillStyle = "rgba(200,205,230,0.5)";
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    ctx.globalAlpha = Math.max(0, p.life / 30) * 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    if (p.life <= 0) particles.splice(i, 1);
  }
  ctx.restore();
}

function loop() {
  frame++;
  ctx.clearRect(0, 0, W, H);
  drawTaskbar();
  drawWallpaper();
  structures.forEach(drawStructure);
  drawWeapons(); // arme pe jos (de luat)

  if (adventureCd-- <= 0) { adventureCd = rand(3600, 9000); if (autoAdventure) startAdventure(); }
  for (let i = _pending.length - 1; i >= 0; i--) {
    const p = _pending[i];
    if (--p.t <= 0) { if (!p.a.away) { p.a.state = "leaving"; p.a.exitX = p.exitX; p.a.adventure = true; if (p.a.opponent) p.a.endFight(); } _pending.splice(i, 1); }
  }

  // focuri stinse → dispar după 5s
  for (let i = structures.length - 1; i >= 0; i--) { const s = structures[i]; if (s.out && --s.outTimer <= 0) structures.splice(i, 1); }

  // videoul se termină → Chrome se închide singur; ei deschid Chrome singuri (rar)
  if (browserWin && frame - browserWin.t0 >= browserWin.dur) closeChrome();
  if (!browserWin) { if (--chromeAutoCd <= 0) { chromeAutoCd = rand(4200, 9000); if (agents.filter(a => a.state === "walk" || a.state === "idle").length >= 2) openChrome(true); } }

  maybeStartFight();
  agents.forEach(a => a.update(W));
  updateArrows();
  updateMinecraft();
  drawParticles();
  drawGroundTexts();
  drawBrowser();
  drawStopwatch();
  drawNotepad();
  drawPaint();
  drawResizeHandles();
  // stickmanii pe layerul cel mai în față — peste tot (cei ținuți în mână deasupra celorlalți)
  const onMc = (a) => minecraftWin && ((a.state === "onwin" && a.onWin === minecraftWin) || (a.state === "climbwin" && a.climbWin === minecraftWin));
  [...agents].sort((a, b) => (a.state === "held" ? 1 : 0) - (b.state === "held" ? 1 : 0) || a.x - b.x).forEach(a => { if (!onMc(a)) a.draw(ctx); });
  drawArrows(); // săgeți în zbor
  drawMinecraft(); // acoperă tot când e deschis
  agents.forEach(a => { if (onMc(a)) a.draw(ctx); }); // cei care stau PE Minecraft — peste el
  if (showHitboxes) drawHitboxes();
  presentGL(); // compune cadrul pe GPU (WebGL) — sau nimic dacă e 2D pur
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
resize();
initAgents();
// casă mică fixă din blocuri (stil AvM) — pre-construită la refresh, unde merg să doarmă
structures.push({ x: clamp(Math.round(W * 0.8), 120, W - 120), color: "#8a5f39", progress: 1, type: "house", scale: 0.85, preset: true });
window.agents = agents; // expus pentru inspecție/feedback (ex. Playwright)
loop();
