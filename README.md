# 🕺 Stick Gang — Gașca lui Alan Becker

Un mini-site (fan-project) cu gașca de stick-figures din **Animator vs. Animation**
(Alan Becker): **Orange** (Second Coming), **Red**, **Green**, **Blue**, **Yellow**.

- 🎨 **Culori oficiale** — hex-urile date chiar de Alan Becker: Orange `#FF6600`,
  Red `#CC0000`, Yellow `#FFCC00`, Green `#66CC00`, Blue `#33CCFF`,
  Purple `#980098`, King Orange `#CC6600`.
- 💬 **Vorbește** cu fiecare — au personalități distincte, răspund în română, scurt.
- 🎨 **„Fă-mi o rachetă"** — îi ceri în chat și chiar o desenează în scenă: 27 de forme
  gata făcute (casă, turn, robot, pisică, sabie, fantomă…), iar cu cheia Claude poate
  desena **orice** îi ceri. Desenul devine platformă reală de parkour.
- 👊 **Bătăi în stil AvM** — combo-uri, upercut care te trimite prin aer, blocări și
  parări, ciocniri de săbii, orbi de energie încărcați, raze, freeze-frame la impact,
  zgâlțâit de ecran, slow-motion la KO și bare de viață.
- 🏃 **Tu în joc** (tasta `R`): parkour, dash, wall-jump și combo de lovituri.
- 🧠 **AI hibrid**: fără cheie merg pe replici scriptate (instant, pentru oricine);
  cu cheia ta Claude, răspund cu AI real, fiecare cu personalitatea lui.

## Rulare locală
Deschide `index.html` în browser. Atât. (Modul scriptat merge complet offline.)

## Activează Claude (opțional)
1. Apasă **⚙️ Setări AI**.
2. Lipește o cheie API Anthropic (`sk-ant-...`).
3. Cheia rămâne **doar în browserul tău** (localStorage) — se trimite exclusiv către
   `api.anthropic.com`. Folosim headerul `anthropic-dangerous-direct-browser-access`.
4. Model implicit: `claude-haiku-4-5` (rapid & ieftin). Schimbă `MODEL` în `js/app.js`.

⚠️ Notă: într-un site static oricine îți vede cheia dacă o pui hardcodată — de-aia
o cere de la fiecare vizitator, nu o punem noi în cod.

## Publicare pe GitHub Pages
```bash
# în folderul proiectului (deja are git init)
git add -A
git commit -m "Stick Gang site"
gh repo create stickfigures --public --source=. --push   # sau creezi manual repo pe github.com
# apoi: Settings → Pages → Branch: main /(root) → Save
```
Site-ul va fi la `https://<user>.github.io/stickfigures/`.

## Controale
`R` creează-ți personajul · `A/D` sau `← →` mișcare · `Space` salt / double jump /
wall-jump · `Shift` dash · `E` lovește · `Ctrl` sprint · `T` șterge-ți personajul ·
`H` hitbox-uri · `G` efecte. Cu mouse-ul: click = pumn, ține & trage = arunci,
click dreapta = chat.

## Structură
- `index.html` — pagina
- `css/style.css` — stil (temă întunecată)
- `js/characters.js` — personaje (culori oficiale) + motor de răspunsuri scriptate
- `js/scene.js` — desen & animație, fizică, parkour, sistemul de luptă și efectele
- `js/chat.js` — UI de chat, integrare Claude / AI local Chrome

Personajele aparțin lui Alan Becker; acesta e un proiect de fani, necomercial.
