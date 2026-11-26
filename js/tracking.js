// Camera, hand and face tracking. Everything runs in the browser; no video leaves the device.
import { FilesetResolver, HandLandmarker, FaceLandmarker, DrawingUtils }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export const EMOTIONS = ["happy", "sad", "angry", "surprised", "neutral"];
const INK = "#8edbe0";
const MIN_CONFIDENCE = 0.55;   // below this the hand is treated as "no letter"

// ---------- letter model (trained on hand landmarks, see tools/train.js) ----------
let model = null;
export async function loadLetterModel(url = "model/letters.json") {
  try {
    const res = await fetch(url);
    if (res.ok) model = await res.json();
  } catch { /* fall back to the hand-written rules below */ }
  return !!model;
}

// Landmarks -> 63 numbers that don't depend on where the hand is, how big it is,
// or which hand it is. Must match tools/train.js exactly.
export function handFeatures(lm, handedness, W, H) {
  const flip = handedness === "Left" ? -1 : 1;
  const pts = lm.map(p => [p.x * W * flip, p.y * H, p.z * W * flip]);
  const [ox, oy, oz] = pts[0];
  let scale = 0;
  for (const i of [5, 9, 13, 17]) scale += Math.hypot(pts[i][0] - ox, pts[i][1] - oy);
  scale = scale / 4 || 1;
  const out = new Array(63);
  pts.forEach((p, i) => {
    out[i * 3] = (p[0] - ox) / scale;
    out[i * 3 + 1] = (p[1] - oy) / scale;
    out[i * 3 + 2] = (p[2] - oz) / scale;
  });
  return out;
}

function runModel(x) {
  let a = x;
  model.layers.forEach((layer, li) => {
    const out = new Array(layer.out);
    for (let o = 0; o < layer.out; o++) {
      let sum = layer.b[o];
      const row = o * layer.in;
      for (let i = 0; i < layer.in; i++) sum += layer.w[row + i] * a[i];
      out[o] = li < model.layers.length - 1 ? Math.max(0, sum) : sum;
    }
    a = out;
  });
  const max = Math.max(...a);
  const exps = a.map(v => Math.exp(v - max));
  const total = exps.reduce((s, v) => s + v, 0);
  let best = 0;
  exps.forEach((v, i) => { if (v > exps[best]) best = i; });
  return { letter: model.labels[best], conf: exps[best] / total };
}

// ---------- hand geometry: rule-based fallback and the open-palm guard ----------
// Landmarks: 0 wrist, thumb 1-4, index 5-8, middle 9-12, ring 13-16, pinky 17-20.
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

function geometry(lm, W, H) {
  const P = lm.map(p => ({ x: p.x * W, y: p.y * H }));
  const d = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y);
  const palm = d(0, 9) || 1;
  const straightness = ([m, p, q, t]) => d(m, t) / (d(m, p) + d(p, q) + d(q, t));
  const ext = FINGERS.map(f => straightness(f) > 0.82 && d(f[3], 0) > d(f[1], 0) * 1.05);
  const curled = FINGERS.map(f => d(f[3], 0) < d(f[1], 0));
  const thumbOut = d(4, 5) / palm > 0.6 && straightness([1, 2, 3, 4]) > 0.8;
  return { P, d, palm, straightness, ext, curled, thumbOut };
}

// A relaxed open hand (all five fingers straight and spread) is not a letter;
// without this the model calls it B or W. Curved or pinched hands like C and F do not count.
function isOpenPalm(g) {
  return FINGERS.every(f => g.straightness(f) > 0.9)
    && g.d(4, 5) / g.palm > 0.75
    && g.d(8, 20) / g.d(5, 17) > 1.5;
}

function classifyByRules(g) {
  const { P, d, palm, ext, curled, thumbOut } = g;
  const [I, M, R, Pk] = ext;
  // Knuckle axis (index MCP -> pinky MCP), handedness independent
  const kx = P[17].x - P[5].x, ky = P[17].y - P[5].y, kl = Math.hypot(kx, ky) || 1;
  const across = i => ((P[i].x - P[5].x) * kx + (P[i].y - P[5].y) * ky) / (kl * kl);
  // "Up" axis of the hand (wrist -> middle MCP)
  const ux = P[9].x - P[0].x, uy = P[9].y - P[0].y, ul = Math.hypot(ux, uy) || 1;
  const up = i => ((P[i].x - P[5].x) * ux + (P[i].y - P[5].y) * uy) / (ul * palm);
  const ix = P[8].x - P[5].x, iy = P[8].y - P[5].y, il = Math.hypot(ix, iy) || 1;
  const sideways = Math.abs(ix / il) > 0.75;
  const down = iy / il > 0.6;
  const pinch = d(4, 8) / palm;

  if (I && M && R && Pk) return "B";
  if (I && M && R && !Pk) return "W";
  if (!I && M && R && Pk && pinch < 0.35) return "F";
  if (I && M && !R && !Pk) {
    if (down) return "P";
    if (sideways) return "H";
    if (across(8) > across(12) + 0.05) return "R";
    if (d(4, 10) / palm < 0.35 && up(4) > 0.15) return "K";
    return d(8, 12) / d(5, 9) > 1.7 ? "V" : "U";
  }
  if (I && !M && !R && !Pk) {
    if (down) return "Q";
    if (sideways) return "G";
    if (thumbOut && d(4, 5) / palm > 0.7) return "L";
    return "D";
  }
  if (!I && !M && !R && Pk) return thumbOut ? "Y" : "I";
  if (!I && !M && !R && !Pk) {
    if (!curled[0] && curled[1] && curled[2] && curled[3] && pinch > 0.35) return "X";
    if (!curled[0] && !curled[1] && !curled[2]) return pinch < 0.3 ? "O" : "C";
    if (curled.every(Boolean)) {
      const t = across(4);
      const tipsUp = Math.min(up(8), up(12), up(16), up(20));
      if (t < -0.05) return "A";
      if (up(4) < tipsUp - 0.08) return "E";
      if (t < 0.25) return "T";
      if (t < 0.5) return "S";
      if (t < 0.75) return "N";
      return "M";
    }
  }
  return null;
}

// What the classifier makes of one hand, before any thresholds. Useful when tuning.
export function inspectHand(lm, handedness, W, H) {
  const g = geometry(lm, W, H);
  const openPalm = isOpenPalm(g);
  if (!model) return { openPalm, letter: classifyByRules(g), conf: 1 };
  return { openPalm, ...runModel(handFeatures(lm, handedness, W, H)) };
}

export function classifyHand(lm, handedness, W, H) {
  const { openPalm, letter, conf } = inspectHand(lm, handedness, W, H);
  if (openPalm && (letter === "B" || letter === "W")) return null;
  return conf >= MIN_CONFIDENCE ? letter : null;
}

// ---------- J and Z are drawn in the air ----------
const trail = [];
function motionLetter(base, lm, W, H, now) {
  const usesPinky = base === "I";
  const usesIndex = base === "D" || base === "G" || base === "X";
  if (!usesPinky && !usesIndex) { trail.length = 0; return null; }
  const tip = usesPinky ? 20 : 8;
  trail.push({ x: lm[tip].x * W, y: lm[tip].y * H, t: now, tip });
  while (trail.length && (now - trail[0].t > 900 || trail[0].tip !== tip)) trail.shift();
  if (trail.length < 8) return null;
  let path = 0, turns = 0, prevDx = 0;
  for (let i = 1; i < trail.length; i++) {
    const dx = trail[i].x - trail[i - 1].x, dy = trail[i].y - trail[i - 1].y;
    path += Math.hypot(dx, dy);
    if (Math.abs(dx) > 2) { if (prevDx && Math.sign(dx) !== Math.sign(prevDx)) turns++; prevDx = dx; }
  }
  const palm = Math.hypot((lm[9].x - lm[0].x) * W, (lm[9].y - lm[0].y) * H);
  if (path < palm * 1.3) return null;
  const drawn = usesPinky ? "J" : turns >= 2 ? "Z" : null;
  if (drawn) trail.length = 0;
  return drawn;
}

// ---------- face: the machine's five-emotion reading, plus what it flags ----------
// Counts direction reversals in a signal, to catch a side-to-side head shake.
class Oscillation {
  constructor(threshold, windowMs) {
    this.threshold = threshold; this.windowMs = windowMs;
    this.extreme = null; this.dir = 0; this.reversals = [];
  }
  push(v, t) {
    if (this.extreme === null) { this.extreme = v; return false; }
    const th = this.threshold;
    if (this.dir === 0) {
      if (Math.abs(v - this.extreme) > th) { this.dir = Math.sign(v - this.extreme); this.extreme = v; }
    } else if (this.dir === 1) {
      if (v > this.extreme) this.extreme = v;
      else if (this.extreme - v > th) { this.dir = -1; this.extreme = v; this.reversals.push(t); }
    } else {
      if (v < this.extreme) this.extreme = v;
      else if (v - this.extreme > th) { this.dir = 1; this.extreme = v; this.reversals.push(t); }
    }
    this.reversals = this.reversals.filter(r => t - r < this.windowMs);
    if (this.reversals.length >= 2) { this.reversals.length = 0; return true; }
    return false;
  }
}

export class FaceReader {
  constructor() {
    this.smooth = Object.fromEntries(EMOTIONS.map(e => [e, 0]));
    this.yaw = new Oscillation(0.07, 1500);
    this.shakeUntil = 0;
  }

  read(blendshapes, lm, now) {
    const s = Object.fromEntries(blendshapes.categories.map(c => [c.categoryName, c.score]));
    const avg = (a, b) => ((s[a] || 0) + (s[b] || 0)) / 2;
    const smile = avg("mouthSmileLeft", "mouthSmileRight");
    const frown = avg("mouthFrownLeft", "mouthFrownRight");
    const browDown = avg("browDownLeft", "browDownRight");
    const browUp = Math.max(s.browInnerUp || 0, avg("browOuterUpLeft", "browOuterUpRight"));
    const jaw = s.jawOpen || 0;
    const eyeWide = avg("eyeWideLeft", "eyeWideRight");
    const sneer = avg("noseSneerLeft", "noseSneerRight");
    const press = avg("mouthPressLeft", "mouthPressRight");
    const pucker = Math.max(s.mouthPucker || 0, s.mouthFunnel || 0);

    // Head turn: where the nose tip sits between the two sides of the face.
    const width = Math.hypot(lm[454].x - lm[234].x, lm[454].y - lm[234].y) || 1;
    const turn = (lm[1].x - (lm[234].x + lm[454].x) / 2) / width;
    if (this.yaw.push(turn, now)) this.shakeUntil = now + 900;
    const shaking = now < this.shakeUntil;

    const raw = {
      happy: smile * 1.2,
      surprised: Math.max(browUp * 0.9, Math.min(jaw * 1.6, 1) * Math.max(browUp, eyeWide * 1.5, 0.3)),
      angry: browDown * 1.1 + sneer * 0.6 + press * 0.2 + (shaking ? 0.5 : 0),
      sad: frown * 1.4 + press * 0.5 + pucker * 0.4,
      neutral: 0.3,
    };
    for (const e of EMOTIONS) this.smooth[e] = this.smooth[e] * 0.75 + Math.min(raw[e], 1) * 0.25;
    const label = EMOTIONS.reduce((a, b) => (this.smooth[a] >= this.smooth[b] ? a : b));

    // A confident-sounding number, the way these systems report one.
    const weights = EMOTIONS.map(e => Math.exp(this.smooth[e] * 6));
    const total = weights.reduce((a, b) => a + b, 0);
    const confidence = Object.fromEntries(EMOTIONS.map((e, i) => [e, weights[i] / total]));

    return {
      emotions: { ...this.smooth }, label, confidence,
      markers: {
        browsDown: browDown > 0.4,
        browsUp: browUp > 0.45,
        headshake: shaking,
        mouth: frown > 0.4 || press > 0.55 || pucker > 0.55,
      },
    };
  }
}

// ---------- camera loop ----------
export class Tracker {
  constructor(video, canvas) {
    this.video = video; this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.face = new FaceReader();
    this.onFrame = () => {};
    this.running = false;
    this.lastTime = -1;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    this.video.srcObject = stream;
    await this.video.play();
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    [this.hands, this.faces] = await Promise.all([
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
        runningMode: "VIDEO", numHands: 1,
      }),
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
      }),
    ]);
    this.draw = new DrawingUtils(this.ctx);
    this.running = true;
    const loop = () => { requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  tick() {
    const v = this.video;
    if (v.currentTime === this.lastTime || !v.videoWidth) return;
    this.lastTime = v.currentTime;
    const now = performance.now();
    const W = v.videoWidth, H = v.videoHeight;
    if (this.canvas.width !== W) { this.canvas.width = W; this.canvas.height = H; }
    this.ctx.clearRect(0, 0, W, H);

    const frame = { now, hand: false, letter: null, motion: null, face: null };

    const f = this.faces.detectForVideo(v, now);
    if (f.faceLandmarks.length && f.faceBlendshapes?.length) {
      const lm = f.faceLandmarks[0];
      const style = { color: INK, lineWidth: 2 };
      for (const set of [FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                         FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                         FaceLandmarker.FACE_LANDMARKS_LIPS]) {
        this.draw.drawConnectors(lm, set, style);
      }
      frame.face = this.face.read(f.faceBlendshapes[0], lm, now);
    }

    const h = this.hands.detectForVideo(v, now);
    if (h.landmarks.length) {
      const lm = h.landmarks[0];
      const handedness = h.handedness?.[0]?.[0]?.categoryName || "Right";
      this.draw.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: INK, lineWidth: 3 });
      this.draw.drawLandmarks(lm, { color: INK, fillColor: INK, radius: 4 });
      frame.hand = true;
      frame.letter = classifyHand(lm, handedness, W, H);
      frame.motion = motionLetter(frame.letter, lm, W, H, now);
    } else {
      trail.length = 0;
    }
    this.onFrame(frame);
  }

  // A small mirrored still of the camera with the tracking lines, kept in memory only.
  snapshot(width = 240) {
    const v = this.video;
    if (!v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = width; c.height = Math.round(width * v.videoHeight / v.videoWidth);
    const x = c.getContext("2d");
    x.translate(c.width, 0); x.scale(-1, 1);
    x.drawImage(v, 0, 0, c.width, c.height);
    x.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }
}
