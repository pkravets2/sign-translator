// The Practice screen: the 26 letters, and the grammar that lives on the face.
// The written descriptions are a starting point and should be checked with a signer.

const ALPHABET = [
  ["A", "Make a fist with your thumb resting along the side of your index finger.", "S, T"],
  ["B", "Hold your hand flat with the fingers together and pointing up. Fold your thumb across your palm.", ""],
  ["C", "Curve your fingers and thumb into the shape of a C.", "O"],
  ["D", "Point your index finger up. Touch the tips of the other fingers to your thumb to make a circle.", "Z"],
  ["E", "Curl your fingertips down to rest on your thumb, which is tucked across your palm.", "S, M"],
  ["F", "Touch the tip of your index finger to the tip of your thumb. Hold the other three fingers up and apart.", ""],
  ["G", "Point your index finger sideways with your thumb parallel to it, as if showing a small gap.", "Q"],
  ["H", "Point your index and middle fingers sideways, held together.", "U"],
  ["I", "Make a fist and raise your pinky.", "J"],
  ["J", "Start with the letter I, then trace a J in the air with your pinky.", "I"],
  ["K", "Point your index finger up and your middle finger forward. Rest your thumb tip between them.", "P, V"],
  ["L", "Hold your thumb and index finger out to make an L. Fold the other fingers down.", ""],
  ["M", "Make a fist with your thumb tucked under your first three fingers.", "N, S"],
  ["N", "Make a fist with your thumb tucked under your first two fingers.", "M, T"],
  ["O", "Bring all your fingertips to your thumb to make an O.", "C"],
  ["P", "Make the letter K, then point it down.", "K"],
  ["Q", "Make the letter G, then point it down.", "G"],
  ["R", "Cross your index and middle fingers.", "U"],
  ["S", "Make a fist with your thumb across the front of your fingers.", "A, E"],
  ["T", "Make a fist with your thumb tucked between your index and middle fingers.", "N, A"],
  ["U", "Hold your index and middle fingers up, pressed together.", "V, R"],
  ["V", "Hold your index and middle fingers up and apart.", "U, K"],
  ["W", "Hold your index, middle and ring fingers up and apart. Your thumb holds down your pinky.", ""],
  ["X", "Make a fist and bend your index finger into a hook.", "D"],
  ["Y", "Hold out your thumb and pinky. Fold the other fingers down.", ""],
  ["Z", "Draw a Z in the air with your index finger.", "D"],
].map(([id, how, confused]) => ({ id, kind: "Letter", how, confused, tab: "alphabet" }));

// The two that go with a yes or a no come first.
const FACE = [
  { id: "No", art: { move: "shake" },
    how: "Shake your head from side to side while you spell or sign NO.",
    means: "The headshake is part of the answer. With it, “I put my name in” means “I did not put my name in.”" },
  { id: "Yes", art: { move: "nod" },
    how: "Nod while you spell or sign YES.",
    means: "The nod confirms that something is true, or stresses it." },
  { id: "Yes/no question", art: { brows: "up", move: "lean" },
    how: "Raise your eyebrows and lean your head slightly forward. Hold the last sign a moment longer.",
    means: "Turns a statement into a question. “You put your name in” becomes “Did you put your name in?”" },
  { id: "Wh-question", art: { brows: "down" },
    how: "Lower your eyebrows and hold them there through the question, often with a slight head tilt.",
    means: "Marks a question with who, what, where, when, why or how." },
  { id: "Topic", art: { brows: "up" },
    how: "Raise your eyebrows on the topic, pause briefly, then relax your face for the comment.",
    means: "Sets up what the sentence is about. “The Goblet, [brows up] I never touched it.”" },
  { id: "Condition", art: { brows: "up", move: "lean" },
    how: "Raise your eyebrows and tilt your head for the “if” part, then return to neutral for the result.",
    means: "Marks an “if” clause, without needing a sign for “if”." },
  { id: "Mouth: size", art: { mouth: "puff" },
    how: "Puff your cheeks for something very large or a great amount. Purse your lips for something thin, small or smooth.",
    means: "Mouth shapes work like adjectives. They change the size or amount of what the hands describe." },
  { id: "Mouth: manner", art: { mouth: "mm" },
    how: "Press your lips together and push them slightly out for “as usual, with ease”. Let your tongue show slightly for “carelessly”.",
    means: "Mouth shapes also work like adverbs. They describe how something was done." },
].map(e => ({ ...e, kind: "On the face", tab: "face" }));

const TABS = { alphabet: ALPHABET, face: FACE };
const ALL = [...ALPHABET, ...FACE];

// A schematic face showing where the grammar sits.
function faceArt({ brows = "rest", mouth = "rest", move = null }) {
  const by = brows === "up" ? 66 : brows === "down" ? 82 : 74;
  const inner = brows === "down" ? 8 : brows === "up" ? -3 : 0;
  const mouths = {
    rest: `<path d="M84 140 Q100 146 116 140"/>`,
    mm: `<path d="M82 140 H118"/><path d="M88 146 Q100 150 112 146"/>`,
    puff: `<circle cx="100" cy="141" r="6"/><path d="M50 122 Q38 136 52 150"/><path d="M150 122 Q162 136 148 150"/>`,
  };
  const moves = {
    shake: `<path d="M52 22 H148"/><path d="M62 12 L50 22 L62 32"/><path d="M138 12 L150 22 L138 32"/>`,
    nod: `<path d="M178 62 V138"/><path d="M168 72 L178 60 L188 72"/><path d="M168 128 L178 140 L188 128"/>`,
    lean: `<path d="M100 186 V172"/><path d="M90 178 L100 190 L110 178"/>`,
  };
  return `<svg class="face-art" viewBox="0 0 200 200" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <ellipse cx="100" cy="104" rx="56" ry="66"/>
    <circle cx="78" cy="100" r="4"/><circle cx="122" cy="100" r="4"/>
    <g class="mark"><path d="M62 ${by} L90 ${by + inner}"/><path d="M138 ${by} L110 ${by + inner}"/></g>
    ${mouths[mouth]}
    ${move ? `<g class="mark">${moves[move]}</g>` : ""}
  </svg>`;
}

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function initDictionary(root, { onBack }) {
  const $ = sel => root.querySelector(sel);
  let tab = "alphabet", selected = ALPHABET[0], live = null;

  function tile(it) {
    const on = it === selected ? " on" : "";
    return it.tab === "alphabet"
      ? `<button class="dtile${on}" data-id="${esc(it.id)}"><b>${it.id}</b><img src="signs/${it.id}.svg" alt=""></button>`
      : `<button class="dtile wide${on}" data-id="${esc(it.id)}">${faceArt(it.art)}<span>${esc(it.id)}</span></button>`;
  }

  function renderGrid() {
    $(".dict-grid").className = "dict-grid " + tab;
    $(".dict-grid").innerHTML = TABS[tab].map(tile).join("");
    root.querySelectorAll(".dict-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  }

  function renderDetails() {
    const it = selected;
    const letter = it.tab === "alphabet";
    $(".detail-title").innerHTML = `<b class="${it.id.length > 1 ? "long" : ""}">${esc(it.id)}</b><span>${it.kind}</span>`;
    $(".detail-figure").innerHTML = letter
      ? `<img src="signs/${it.id}.svg" alt="ASL handshape for the letter ${it.id}">` : faceArt(it.art);
    const extra = letter ? (it.confused ? `<h4>Easily confused with</h4><p>${it.confused}</p>` : "")
      : `<h4>What it means</h4><p>${esc(it.means)}</p>`;
    $(".detail-text").innerHTML = `<h4>${letter ? "How to make it" : "How to do it"}</h4><p>${esc(it.how)}</p>${extra}`;
    $(".detail-ref").textContent = letter ? "Drawing from wpclipart, public domain." : "A simple diagram, not a photo.";
    renderLive();
  }

  function renderLive() {
    const chip = $(".detail-live");
    const show = selected.tab === "alphabet" && live !== null;
    chip.hidden = !show;
    if (!show) return;
    const match = live.letter === selected.id;
    chip.classList.toggle("match", match);
    chip.textContent = match ? `The camera sees ${selected.id}. You have got it.`
      : live.letter ? `The camera sees ${live.letter}. Try ${selected.id}.` : `Make ${selected.id} in front of the camera to practise.`;
  }

  function select(id) {
    const it = ALL.find(i => i.id === id);
    if (!it) return;
    selected = it; tab = it.tab;
    renderGrid(); renderDetails();
  }

  $(".dict-grid").addEventListener("click", e => {
    const b = e.target.closest(".dtile");
    if (b) select(b.dataset.id);
  });
  $(".dict-tabs").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) select(TABS[b.dataset.tab][0].id);
  });
  root.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", onBack));

  renderGrid(); renderDetails();

  return {
    // Called every frame with the letter the camera currently sees (or null), once the camera is on.
    setLive(letter) {
      if (live && live.letter === letter) return;
      live = { letter };
      renderLive();
    },
    open(id) { if (id) select(id); },
  };
}
