// The Goblet of Fire: name entry -> the Goblet's verdict -> interrogation -> book vs film.
import { Tracker, loadLetterModel } from "./tracking.js";
import { autocorrect, titleCase } from "./names.js";
import { QUESTIONS, REACTIONS, MARKERS, NARRATION, TIER_SAID, pick } from "./script.js";
import { initDictionary } from "./dictionary.js";
import { readAnswer } from "./answers.js";

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// ?demo lets you run the whole piece from the keyboard: letters type, 1-4 fake a facial marker.
const DEMO = new URLSearchParams(location.search).has("demo");

const HOLD_MS = 700;          // how long a letter is held before it is entered
const ANSWER_MS = 60000;      // how long Dumbledore waits for an answer
const HAND_GONE_MS = 5000;    // hand lowered this long = answer given
const MARKER_HOLD_MS = 350;   // a facial marker must last this long to be flagged
const REVEAL_IDLE_MS = 150000;
const ABANDON_MS = 45000;     // a half-entered name with no hand in view this long is cleared
const WAIT_HINT = `Spell NO with a headshake, or YES with a nod. Lower your hand for ${HAND_GONE_MS / 1000} seconds when done.`;
const ECHO_MS = 2300;         // how long the machine shows what it wrote down
const RULING_MS = 10000;      // how long the verdict stays up before the reveal starts

const state = {
  stage: "idle",              // idle | name | considering | announce | interrogation | ruling | reveal
  intro: true,                // the welcome screen, shown to every new visitor
  helpOpen: false,            // the same screen, reopened mid-visit from "How it works"
  dictOpen: false,
  entry: "", run: 0, tier: 1,
  session: null, round: null,
  sound: true, tracking: false,
};
let tracker = null;

// ---------- stage and view ----------
function setStage(stage) {
  state.stage = stage;
  document.body.dataset.stage = stage;
  const step = stage === "interrogation" || stage === "ruling" ? "interrogation" : stage === "reveal" ? "reveal" : "name";
  document.querySelectorAll("#steps li").forEach(li => li.classList.toggle("on", li.dataset.step === step));
  if (stage !== "interrogation") $("stepQuestions").textContent = stage === "ruling" ? "The verdict" : "The questions";
  $("prompt").textContent = stage === "idle" ? "Start the camera to begin" : "Spell your name";
  $("promptSub").textContent = stage === "idle"
    ? "Then spell your name with your hand."
    : "This tells the machine who you are. Hold each letter still.";
  $("submitBtn").textContent = stage === "interrogation" ? "That is my answer"
    : stage === "ruling" ? "See what really happened" : "That is my name";
  $("dictBtn").disabled = ["considering", "announce", "interrogation", "ruling"].includes(stage);
  renderEntry();
  syncView();
}

function syncView() {
  document.body.dataset.view = state.helpOpen ? "intro" : state.dictOpen ? "dictionary" : state.intro ? "intro"
    : state.stage === "reveal" ? "reveal" : "station";
  document.body.dataset.help = state.helpOpen ? "open" : "";
  $("helpBtn").textContent = state.helpOpen ? "Close" : "How it works";
  $("helpBtn").setAttribute("aria-expanded", state.helpOpen);
  $("beginBtn").textContent = state.helpOpen ? "Back to where I was" : "Start";
}

// ---------- the slip of parchment ----------
const canType = () => state.stage === "name" || (state.stage === "interrogation" && !!state.round?.open);

function renderEntry() {
  const typing = canType();
  if (state.entry) {
    $("entry").innerHTML = `<span class="typed">${esc(state.entry)}</span><span class="caret"></span>`;
  } else {
    const hint = state.stage === "interrogation" ? (typing ? "Spell YES or NO" : "")
      : state.stage === "ruling" ? "" : "Your name will appear here";
    $("entry").innerHTML = `<span class="placeholder">${hint}</span>`;
  }
  $("submitBtn").disabled = state.stage === "ruling" ? false : state.stage === "name" ? !state.entry.trim() : !typing;
  for (const id of ["spaceBtn", "backBtn", "clearBtn"]) $(id).disabled = !typing || !state.entry;
}

function typeLetter(ch) {
  if (!canType() || state.dictOpen || state.intro || state.helpOpen || state.entry.length >= 22) return;
  state.entry += ch;
  renderEntry();
}

$("spaceBtn").onclick = () => { if (state.entry && !state.entry.endsWith(" ")) typeLetter(" "); };
$("backBtn").onclick = () => { state.entry = state.entry.slice(0, -1); renderEntry(); };
$("clearBtn").onclick = () => { state.entry = ""; renderEntry(); };
$("submitBtn").onclick = () => {
  if (state.stage === "name") submitName();
  else if (state.stage === "ruling") showReveal();
  else if (state.round?.open) endRound();
};

// ---------- reading letters from the camera ----------
const input = { votes: [], candidate: null, since: 0, committed: false, lastHandAt: 0 };
const tiles = {};
for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  const b = document.createElement("button");
  b.className = "ref";
  b.title = `Practise ${ch}`;
  b.innerHTML = `<img src="signs/${ch}.svg" alt=""><span>${ch}</span>`;
  b.onclick = () => { if (!$("dictBtn").disabled) { dictionary.open(ch); openDictionary(); } };
  $("alphabet").appendChild(b);
  tiles[ch] = b;
}

const shown = { letter: undefined, text: "" };
function showDetected(letter, progress, entered) {
  $("holdBar").style.width = `${progress * 100}%`;
  const text = !letter ? "Hold up a letter" : entered ? "Got it. Now the next letter." : "Hold still…";
  if (text !== shown.text) { shown.text = text; $("detectedText").textContent = text; }
  if (letter === shown.letter) return;
  shown.letter = letter;
  $("current").textContent = letter || "–";
  $("current").classList.toggle("on", !!letter);
  for (const ch in tiles) tiles[ch].classList.toggle("on", ch === letter);
}

function readLetter(frame) {
  const now = frame.now;
  if (frame.hand) input.lastHandAt = now;
  if (frame.motion) {                       // J and Z are entered the moment they are drawn
    typeLetter(frame.motion);
    input.votes.length = 0; input.committed = true;
    showDetected(frame.motion, 1, true);
    return frame.motion;
  }
  input.votes.push(frame.letter);
  if (input.votes.length > 7) input.votes.shift();
  const counts = {};
  for (const v of input.votes) counts[v] = (counts[v] || 0) + 1;
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const stable = n >= 4 && best !== "null" ? best : null;

  if (stable !== input.candidate) { input.candidate = stable; input.since = now; input.committed = false; }
  if (stable && !input.committed && now - input.since >= HOLD_MS) { input.committed = true; typeLetter(stable); }
  const progress = !stable ? 0 : input.committed ? 1 : Math.min(1, (now - input.since) / HOLD_MS);
  showDetected(stable, progress, input.committed);
  return stable;
}

// ---------- reading the face ----------
const markerSince = {};
const demoMarkers = {};
let faceShown = null;

function demoFace(now) {
  const markers = Object.fromEntries(Object.keys(MARKERS).map(k => [k, now < (demoMarkers[k] || 0)]));
  const active = Object.keys(markers).find(k => markers[k]);
  const label = active ? MARKERS[active].machine : "neutral";
  return { label, confidence: { [label]: 0.86 }, markers };
}

function readFace(frame) {
  const face = frame.face;
  const label = face ? face.label : "";
  if (label !== faceShown) {                // one plain sentence, shown before the questions start
    faceShown = label;
    $("faceLine").innerHTML = face ? `The machine thinks you look <b>${label}</b>.` : "The machine is looking for your face.";
  }
  const round = state.round;
  if (!round || !face) { for (const k in markerSince) markerSince[k] = null; return; }
  for (const key of Object.keys(MARKERS)) {
    if (!face.markers[key]) { markerSince[key] = null; continue; }
    markerSince[key] ??= frame.now;
    const needed = key === "headshake" ? 0 : MARKER_HOLD_MS;
    if (round.seen[key] || frame.now - markerSince[key] < needed) continue;
    round.seen[key] = true;
    round.events.push({
      marker: key,
      confidence: Math.max(0.61, face.confidence[MARKERS[key].machine] || 0),
      snap: tracker ? tracker.snapshot(320) : null,
    });
  }
}

function handleFrame(frame) {
  if (DEMO && !frame.face) frame.face = demoFace(frame.now);
  const letter = readLetter(frame);
  readFace(frame);
  dictionary.setLive(letter);
  tickRound(frame.now);
  if (state.stage === "name" && state.entry && frame.now - input.lastHandAt > ABANDON_MS) {
    state.entry = "";
    renderEntry();
  }
}

// ---------- sound ----------
let voices = [];
if ("speechSynthesis" in window) {
  const load = () => { voices = speechSynthesis.getVoices(); };
  load(); speechSynthesis.onvoiceschanged = load;
}
// Chrome can silently drop speech if speak() follows cancel() in the same tick, if the
// engine was left paused, or if nothing holds on to the utterance. This guards all three.
let speaking = null, speakTimer = null;
function speak(text, tier) {
  if (!state.sound || !("speechSynthesis" in window) || !text.trim()) return;
  clearTimeout(speakTimer);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.toLowerCase());
  if (!voices.length) voices = speechSynthesis.getVoices();
  u.voice = voices.find(v => /en-GB/i.test(v.lang) && /(male|george|ryan|daniel)/i.test(v.name))
    || voices.find(v => /en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
  u.lang = u.voice ? u.voice.lang : "en-GB";
  u.rate = [0, 0.85, 0.95, 1.1, 1.25][tier];
  u.pitch = [0, 0.8, 0.85, 0.95, 1.1][tier];
  u.volume = [0, 0.8, 0.88, 0.95, 1][tier];
  u.onerror = e => console.warn("speech failed:", e.error);
  speaking = u;
  speakTimer = setTimeout(() => { speechSynthesis.resume(); speechSynthesis.speak(u); }, 80);
}
function hush() {
  clearTimeout(speakTimer);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
$("soundBtn").onclick = () => {
  state.sound = !state.sound;
  $("soundBtn").textContent = state.sound ? "Sound on" : "Sound off";
  $("soundBtn").setAttribute("aria-pressed", state.sound);
  if (state.sound) speak("Sound is on.", 2);   // doubles as a sound check
  else hush();
};

// ---------- the Goblet's list: what was spelled, and what it read ----------
function loadRegister() {
  try { return JSON.parse(localStorage.getItem("goblet-register")) || []; } catch { return []; }
}
function renderRegister() {
  const rows = loadRegister().slice(-4).reverse();
  $("register").hidden = !rows.length;
  $("registerRows").innerHTML = rows.map(r =>
    `<li class="${r.signed === r.announced ? "" : "changed"}"><span>${esc(r.signed)}</span><b>${esc(r.announced)}</b></li>`).join("");
}
function addToRegister(signed, announced) {
  try { localStorage.setItem("goblet-register", JSON.stringify([...loadRegister(), { signed, announced }].slice(-40))); } catch { /* private mode */ }
  renderRegister();
}
$("registerClear").onclick = () => {
  try { localStorage.removeItem("goblet-register"); } catch { /* nothing stored */ }
  renderRegister();
};

// ---------- step 1: the name ----------
async function submitName() {
  const typed = state.entry.trim();
  if (!typed) return;
  const run = ++state.run;
  const verdict = autocorrect(typed);
  state.session = { ...verdict, rounds: [] };
  addToRegister(verdict.signed, verdict.name);
  state.entry = "";
  setStage("considering");
  await wait(1900);
  if (run !== state.run) return;
  $("announceName").textContent = verdict.name;
  setStage("announce");
  speak(verdict.name, 2);
  await wait(3400);
  if (run !== state.run) return;
  interrogate(run);
}

// ---------- step 2: the interrogation ----------
async function interrogate(run) {
  state.tier = 1;
  $("dumbledore").dataset.tier = 1;
  $("question").innerHTML = "";
  $("narration").classList.remove("shown");
  setStage("interrogation");
  await wait(1500);
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (run !== state.run) return;
    const round = await runRound(i);
    if (run !== state.run) return;
    // Words: forced into yes or no. Silence, or an answer in signs it cannot read, is not a denial.
    Object.assign(round, readAnswer(round.answer));
    round.admits = round.read === null || round.read === QUESTIONS[i].admits;
    await echo(round);
    if (run !== state.run) return;
    // Face: what the machine flagged sets how far he escalates.
    round.tierAfter = Math.min(4, round.tier + Math.min(2, round.events.length));
    state.tier = round.tierAfter;
    state.session.rounds.push(round);
    await wait(400);
  }
  if (run !== state.run) return;
  rule(run);
}

// He says back what the machine wrote down, and the slip shows the rewrite.
async function echo(round) {
  const said = round.read ? `You say ${round.read.toLowerCase()}.` : "You say nothing.";
  const q = $("question");
  q.className = "question";
  void q.offsetWidth;
  q.className = "question echo r-settle";
  q.innerHTML = said.split(" ").map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(" ");
  $("entry").innerHTML = !round.answer ? `<span class="placeholder">Nothing the machine could read</span>`
    : round.changed ? `<s>${esc(round.answer)}</s><span class="typed">${round.read}</span>`
    : `<span class="typed">${esc(round.answer)}</span>`;
  speak(said, 1);
  await wait(ECHO_MS);
}

// The verdict. An admission (real, forced or assumed from silence) settles it.
// Otherwise the face does: escalate past "firm" and the denial is not believed.
async function rule(run) {
  const s = state.session;
  const name = titleCase(s.name.split(" ")[0]);
  s.confessed = s.rounds.some(r => r.admits);
  s.believed = !s.confessed && s.rounds.at(-1).tierAfter <= 2;
  const title = s.confessed ? "Confession recorded" : s.believed ? "Believed" : "Not believed";
  $("rulingTitle").textContent = title;
  $("rulingSub").textContent = s.believed
    ? `The machine records that ${name} did not put the name in.`
    : `The machine records that ${name} put the name in the Goblet.`;
  $("ruling").dataset.result = s.believed ? "cleared" : "guilty";
  setStage("ruling");
  speak(title, 2);
  await wait(RULING_MS);
  if (run !== state.run || state.stage !== "ruling") return;
  showReveal();
}

function runRound(index) {
  return new Promise(resolve => {
    const tier = index === 0 ? 1 : state.tier;
    const name = titleCase(state.session.name.split(" ")[0]);
    let text = pick(QUESTIONS[index].tiers[tier]).replace("{name}", name);
    if (tier === 4) text = text.toUpperCase();
    const reaction = pick(REACTIONS[tier]);
    const words = text.split(" ");

    const q = $("question");
    $("dumbledore").dataset.tier = tier;
    q.className = "question";
    void q.offsetWidth;                       // restart the entrance animation
    q.className = `question r-${reaction}`;
    q.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(" ");
    $("stepQuestions").textContent = `Question ${index + 1} of ${QUESTIONS.length}`;
    speak(text, tier);

    state.entry = "";
    state.round = { index, text, tier, reaction, events: [], seen: {}, open: false, resolve, deadline: 0 };
    renderEntry();
    const settle = words.length * [0, 110, 75, 55, 45][tier] + 900;
    setTimeout(() => {
      $("narration").classList.add("shown");
      const r = state.round;
      if (!r || r.resolve !== resolve) return;
      r.open = true;
      r.deadline = performance.now() + ANSWER_MS;
      input.lastHandAt = performance.now();
      renderEntry();
    }, settle);
  });
}

function tickRound(now) {
  if (state.helpOpen) return;               // the clock stops while "How it works" is open
  const r = state.round;
  if (!r || !r.open) {
    $("waitBar").style.width = "100%";
    if ($("waitHint").textContent !== WAIT_HINT) $("waitHint").textContent = WAIT_HINT;
    return;
  }
  $("waitBar").style.width = `${Math.max(0, (r.deadline - now) / ANSWER_MS) * 100}%`;
  const gone = now - input.lastHandAt;
  const hint = state.entry.trim() && gone > 800
    ? `Giving your answer in ${Math.max(1, Math.ceil((HAND_GONE_MS - gone) / 1000))}…`
    : WAIT_HINT;
  if ($("waitHint").textContent !== hint) $("waitHint").textContent = hint;
  if (now > r.deadline || (state.entry.trim() && gone > HAND_GONE_MS)) endRound();
}

function endRound() {
  const r = state.round;
  if (!r) return;
  state.round = null;
  r.answer = state.entry.trim();
  state.entry = "";
  renderEntry();
  r.resolve(r);
}

// ---------- step 3: the book and the film, one moment at a time ----------
// The transcript tidies everything: no capitals for volume, no exclamation marks.
function bookify(text, name) {
  let s = text.toLowerCase().replace(/\?!/g, "?").replace(/!/g, ".");
  s = s.replace(/(^|[.?]\s+)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
  s = s.replace(/\bgoblet\b/g, "Goblet").replace(/\bfire\b/g, "Fire").replace(/\bi\b/g, "I");
  return s.replace(new RegExp(`\\b${name.toLowerCase()}\\b`, "g"), name);
}

let pages = [], pageIndex = 0;

function buildPages() {
  const s = state.session;
  const name = esc(titleCase(s.name.split(" ")[0]));
  const out = [];

  out.push({
    where: "Your name",
    book: `<p>The Goblet of Fire gave up one name.</p><p>\u201c${esc(titleCase(s.name))},\u201d the slip read. The machine was ${(s.confidence * 100).toFixed(0)}% sure.</p>`,
    film: s.changed
      ? `<p class="lead">You spelled ${esc(s.signed)}.<br>The machine read <b>${esc(s.name)}</b>.</p>
         <p class="note">It swapped your name for one it knew better, and it never asked you to repeat it. A person would have said, \u201cdo you mean\u2026?\u201d</p>`
      : `<p class="lead">You spelled ${esc(s.signed)} and the machine read ${esc(s.name)}.</p>
         <p class="note">Names it already knows pass straight through. Other people in the queue may not be so lucky.</p>`,
  });

  s.rounds.forEach((r, i) => {
    const last = i === s.rounds.length - 1;
    const reply = r.read ? `<p>\u201c${r.read[0] + r.read.slice(1).toLowerCase()},\u201d said ${name}.</p>` : `<p>${name} said nothing.</p>`;
    const heard = !r.answer ? `<p class="heard">The machine read no answer. It only reads fingerspelled letters, and <b>it counted the silence against you</b>.</p>`
      : r.changed ? `<p class="heard">You spelled ${esc(r.answer)}. <b>The machine wrote down ${r.read}.</b></p>`
      : `<p class="heard">You spelled ${esc(r.answer)}.</p>`;
    const flags = r.events.map(ev => {
      const m = MARKERS[ev.marker];
      return `<figure class="flag">${ev.snap ? `<img src="${ev.snap}" alt="Camera still from this moment">` : `<div class="nosnap"></div>`}
        <figcaption><b>${m.seen}</b>
          <span class="read">The machine read this as ${m.machine}, ${Math.round(ev.confidence * 100)}% sure.</span>
          <span>${m.asl}</span></figcaption></figure>`;
    }).join("");
    const outcome = last || !r.events.length ? ""
      : r.tierAfter > r.tier ? `<p class="outcome">So his next question got louder.</p>`
      : `<p class="outcome">He was already shouting.</p>`;
    out.push({
      where: `Question ${i + 1} of ${s.rounds.length}`,
      book: `<p>\u201c${esc(bookify(r.text, name))}\u201d ${NARRATION}</p>${reply}`,
      film: `<p class="said">${TIER_SAID[r.tier]}</p><p class="film-q t${r.tier}">${esc(r.text)}</p>${heard}${flags}${outcome}`,
    });
  });

  // Why the machine ruled the way it did.
  let why;
  if (s.believed) {
    why = `<p class="lead">It believed you, because your face stayed still.</p>
      <p class="note">In ASL a still face leaves out the grammar: questions, negation and emphasis all live there. To be believed, you had to say less.</p>`;
  } else if (s.confessed) {
    const n = s.rounds.findIndex(r => r.admits), r = s.rounds[n];
    why = !r.answer
      ? `<p class="lead">It recorded a confession you never made.</p>
         <p class="note">On question ${n + 1} it could not read your answer, and it took your silence as an admission. If you answered in signs, it never saw them: it only reads letters.</p>`
      : r.changed
      ? `<p class="lead">It recorded a confession you never made.</p>
         <p class="note">On question ${n + 1} you spelled ${esc(r.answer)}. It did not know that answer, so it wrote down ${r.read} and counted it as an admission.</p>`
      : `<p class="lead">It took you at your word.</p>
         <p class="note">On question ${n + 1} you spelled ${r.read}, and it counted that as an admission.</p>`;
  } else {
    why = `<p class="lead">You denied it every time, and it did not believe you.</p>
      <p class="note">What it held against you was grammar on your face, read as attitude.</p>`;
  }
  out.push({
    where: "The verdict", plain: true,
    book: `<p>Tone throughout: calm.</p><p>Errors detected: none.</p><p>Verdict: ${name} ${s.believed ? "did not put the name in" : "put the name in the Goblet of Fire"}.</p>`,
    film: `${why}<p class="closing">Recognition is not understanding.</p>`,
  });
  return out;
}

function renderPage() {
  const p = pages[pageIndex];
  $("revealWhere").textContent = p.where;
  $("bookPage").innerHTML = p.book;
  $("bookPage").classList.toggle("plain", !!p.plain);
  $("filmPage").innerHTML = p.film;
  $("bookPage").scrollTop = 0; $("filmPage").scrollTop = 0;
  $("revealCount").textContent = `${pageIndex + 1} of ${pages.length}`;
  $("revealBack").disabled = pageIndex === 0;
  $("revealNext").textContent = pageIndex === pages.length - 1 ? "Start over" : "Next";
}

function showReveal() {
  pages = buildPages();
  pageIndex = 0;
  renderPage();
  setStage("reveal");
  hush();
  armIdleReset();
}

$("revealBack").onclick = () => { if (pageIndex > 0) { pageIndex--; renderPage(); } };
$("revealNext").onclick = () => {
  if (pageIndex === pages.length - 1) return reset();
  pageIndex++;
  renderPage();
};

let idleTimer = null;
function armIdleReset() {
  clearTimeout(idleTimer);
  if (state.stage === "reveal") idleTimer = setTimeout(reset, REVEAL_IDLE_MS);
}
for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, armIdleReset, { passive: true });

function reset() {
  state.run++;
  state.round = null;
  hush();
  state.entry = ""; state.session = null; state.tier = 1;
  pages = [];
  clearTimeout(idleTimer);
  state.intro = true;
  state.helpOpen = false;
  setStage(state.tracking ? "name" : "idle");
}
$("againBtn").onclick = reset;

// ---------- dictionary ----------
const dictionary = initDictionary($("dictView"), { onBack: () => { state.dictOpen = false; syncView(); } });
function openDictionary() { state.dictOpen = true; syncView(); }
$("dictBtn").onclick = openDictionary;

// ---------- camera ----------
async function startCamera() {
  const status = $("camStatus");
  status.innerHTML = `<strong>Starting the camera…</strong><p>This takes a few seconds the first time.</p>`;
  try {
    tracker = new Tracker($("video"), $("overlay"));
    tracker.onFrame = handleFrame;
    await tracker.start();
    began("on");
  } catch (err) {
    console.error(err);
    tracker = null;
    status.innerHTML = `<strong>The camera did not start</strong>
      <p>Allow camera access for this page, then try again. Chrome and Edge work best.</p>
      <button id="retryBtn" class="primary big">Try again</button>
      ${DEMO ? `<button id="demoBtn" class="quiet">Continue without a camera</button>` : ""}`;
    $("retryBtn").onclick = startCamera;
    if (DEMO) $("demoBtn").onclick = startDemo;
  }
}

function began(mode) {
  state.tracking = true;
  document.body.dataset.camera = mode;
  setStage("name");
}

let demoLoop = null;
function startDemo() {
  demoLoop ??= setInterval(() => handleFrame({ now: performance.now(), hand: false, letter: null, motion: null, face: null }), 50);
  began("demo");
}

$("startBtn").onclick = () => { speak("The Goblet is listening.", 1); startCamera(); };

// Leaving the welcome screen. The camera stays on between visitors, so it only starts once.
function begin(withCamera) {
  state.intro = false;
  state.entry = "";
  speak("The Goblet is listening.", 1);
  if (state.tracking) setStage("name");
  else if (withCamera) { syncView(); startCamera(); }
  else startDemo();
}
$("beginBtn").onclick = () => (state.helpOpen ? toggleHelp(false) : begin(true));

// "How it works" reopens the welcome without losing your place. Time spent reading it
// is added back to the answer clock.
let helpSince = 0;
function toggleHelp(open) {
  if (open === state.helpOpen || (open && state.intro && !state.dictOpen)) return;
  const now = performance.now();
  if (open) helpSince = now;
  else {
    if (state.round?.open) state.round.deadline += now - helpSince;
    input.lastHandAt = now;
  }
  state.helpOpen = open;
  syncView();
}
$("helpBtn").onclick = () => toggleHelp(!state.helpOpen);
if (DEMO) {
  $("demoBtn").hidden = false;
  $("demoBtn").onclick = startDemo;
  $("beginDemoBtn").hidden = false;
  $("beginDemoBtn").onclick = () => begin(false);
}

// ---------- keyboard ----------
document.addEventListener("keydown", e => {
  const on = sel => e.target instanceof Element && e.target.matches(sel);
  if (on("input, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (state.helpOpen) { if (e.key === "Escape" || (e.key === "Enter" && !on("button"))) toggleHelp(false); return; }
  if (state.dictOpen) { if (e.key === "Escape") { state.dictOpen = false; syncView(); } return; }
  if (state.intro) { if (e.key === "Enter" && !on("button")) $("beginBtn").click(); return; }
  if (state.stage === "reveal") {
    if (e.key === "ArrowRight" || (e.key === "Enter" && !on("button"))) $("revealNext").click();
    if (e.key === "ArrowLeft") $("revealBack").click();
    return;
  }
  if (e.key === "Enter" && !on("button")) { $("submitBtn").click(); return; }
  if (e.key === "Backspace") { $("backBtn").click(); return; }
  if (e.key === "Escape") { $("clearBtn").click(); return; }
  if (e.key === " " && !on("button")) { e.preventDefault(); $("spaceBtn").click(); return; }
  if (!DEMO) return;
  if (/^[a-z]$/i.test(e.key)) { input.lastHandAt = performance.now(); typeLetter(e.key.toUpperCase()); }
  const marker = { 1: "browsDown", 2: "browsUp", 3: "headshake", 4: "mouth" }[e.key];
  if (marker) demoMarkers[marker] = performance.now() + 900;
});

$("narration").textContent = NARRATION;
document.querySelectorAll("[data-goblet]").forEach(el => {
  el.innerHTML = `<svg viewBox="0 0 240 250" aria-hidden="true">
    <circle class="g-halo" cx="120" cy="122" r="118"/>
    <g class="g-flame">
      <path class="f-outer" d="M120 20C128 52 170 66 161 108C156 128 140 138 120 138C100 138 84 128 79 108C75 88 92 80 96 64C104 78 111 70 108 56C107 42 114 30 120 20Z"/>
      <path class="f-inner" d="M120 86C128 100 139 106 136 120C134 130 128 136 120 136C112 136 106 130 104 120C101 106 112 100 120 86Z"/>
    </g>
    <path class="g-cup" d="M58 142H182C182 178 160 198 133 202V228H158V242H82V228H107V202C80 198 58 178 58 142Z"/>
    <path class="g-line" d="M72 154H168"/>
  </svg>`;
});

renderRegister();
setStage("idle");
loadLetterModel().then(ok => { document.body.dataset.model = ok ? "trained" : "rules"; });
