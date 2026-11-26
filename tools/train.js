// Step 2 of training the letter model.
// Reads the landmarks written by extract-server.js and trains a small neural
// network (63 -> 128 -> 64 -> 26) that maps a hand's landmarks to a letter.
// Plain JavaScript, no dependencies.
//
//   node tools/train.js <data-dir>/landmarks.jsonl model/letters.json
//
// It first trains on one dataset and tests on the other, which is the honest
// measure of how well it carries over to a new hand, then trains the shipped
// model on both.
const fs = require("fs");
const [src, dest] = process.argv.slice(2);
const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Must match handFeatures() in js/tracking.js.
function features(row) {
  const flip = row.hand === "Left" ? -1 : 1;
  const pts = row.lm.map(p => [p[0] * row.w * flip, p[1] * row.h, p[2] * row.w * flip]);
  const [ox, oy, oz] = pts[0];
  let scale = 0;
  for (const i of [5, 9, 13, 17]) scale += Math.hypot(pts[i][0] - ox, pts[i][1] - oy);
  scale = scale / 4 || 1;
  const out = new Float32Array(63);
  pts.forEach((p, i) => {
    out[i * 3] = (p[0] - ox) / scale;
    out[i * 3 + 1] = (p[1] - oy) / scale;
    out[i * 3 + 2] = (p[2] - oz) / scale;
  });
  return out;
}

// Small random tilt, stretch and jitter, so the model tolerates a hand held a
// little differently from the ones in the photos.
function augment(x) {
  const a = (Math.random() - 0.5) * 0.5;               // up to about 14 degrees either way
  const c = Math.cos(a), s = Math.sin(a);
  const k = 1 + (Math.random() - 0.5) * 0.16;
  const kz = 1 + (Math.random() - 0.5) * 0.5;
  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
    out[i * 3] = (c * px - s * py) * k + gauss() * 0.02;
    out[i * 3 + 1] = (s * px + c * py) * k + gauss() * 0.02;
    out[i * 3 + 2] = pz * k * kz + gauss() * 0.03;
  }
  return out;
}
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

function makeNet(sizes) {
  return sizes.slice(1).map((out, li) => {
    const inp = sizes[li];
    const w = new Float32Array(out * inp);
    const scale = Math.sqrt(2 / inp);
    for (let i = 0; i < w.length; i++) w[i] = gauss() * scale;
    return { in: inp, out, w, b: new Float32Array(out),
             mw: new Float32Array(out * inp), vw: new Float32Array(out * inp),
             mb: new Float32Array(out), vb: new Float32Array(out) };
  });
}

function forward(net, x) {
  const acts = [x];
  net.forEach((L, li) => {
    const a = acts[li], z = new Float32Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let sum = L.b[o];
      const row = o * L.in;
      for (let i = 0; i < L.in; i++) sum += L.w[row + i] * a[i];
      z[o] = li < net.length - 1 ? Math.max(0, sum) : sum;
    }
    acts.push(z);
  });
  return acts;
}

function predict(net, x) {
  const out = forward(net, x).at(-1);
  let best = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[best]) best = i;
  return best;
}

function train(net, data, epochs) {
  const lr = 0.001, b1 = 0.9, b2 = 0.999, eps = 1e-8, batchSize = 64;
  let step = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [data[i], data[j]] = [data[j], data[i]];
    }
    for (let start = 0; start < data.length; start += batchSize) {
      const batch = data.slice(start, start + batchSize);
      const gw = net.map(L => new Float32Array(L.w.length));
      const gb = net.map(L => new Float32Array(L.out));
      for (const { x, y } of batch) {
        const acts = forward(net, augment(x));
        const out = acts.at(-1);
        let max = -Infinity;
        for (const v of out) if (v > max) max = v;
        let total = 0;
        const p = new Float32Array(out.length);
        for (let i = 0; i < out.length; i++) { p[i] = Math.exp(out[i] - max); total += p[i]; }
        let delta = new Float32Array(out.length);
        for (let i = 0; i < out.length; i++) delta[i] = p[i] / total - (i === y ? 1 : 0);
        for (let li = net.length - 1; li >= 0; li--) {
          const L = net[li], a = acts[li];
          const prev = new Float32Array(L.in);
          for (let o = 0; o < L.out; o++) {
            const dv = delta[o];
            if (dv === 0) continue;
            gb[li][o] += dv;
            const row = o * L.in;
            for (let i = 0; i < L.in; i++) { gw[li][row + i] += dv * a[i]; prev[i] += dv * L.w[row + i]; }
          }
          if (li > 0) for (let i = 0; i < L.in; i++) if (a[i] <= 0) prev[i] = 0;
          delta = prev;
        }
      }
      step++;
      const n = batch.length;
      const corr = Math.sqrt(1 - b2 ** step) / (1 - b1 ** step);
      net.forEach((L, li) => {
        for (let i = 0; i < L.w.length; i++) {
          const g = gw[li][i] / n;
          L.mw[i] = b1 * L.mw[i] + (1 - b1) * g;
          L.vw[i] = b2 * L.vw[i] + (1 - b2) * g * g;
          L.w[i] -= lr * corr * L.mw[i] / (Math.sqrt(L.vw[i]) + eps);
        }
        for (let i = 0; i < L.out; i++) {
          const g = gb[li][i] / n;
          L.mb[i] = b1 * L.mb[i] + (1 - b1) * g;
          L.vb[i] = b2 * L.vb[i] + (1 - b2) * g * g;
          L.b[i] -= lr * corr * L.mb[i] / (Math.sqrt(L.vb[i]) + eps);
        }
      });
    }
  }
}

function accuracy(net, data) {
  const perLabel = LABELS.map(() => [0, 0]);
  const confused = {};
  let right = 0;
  for (const { x, y } of data) {
    const p = predict(net, x);
    perLabel[y][1]++;
    if (p === y) { right++; perLabel[y][0]++; }
    else { const k = LABELS[y] + ">" + LABELS[p]; confused[k] = (confused[k] || 0) + 1; }
  }
  return { acc: right / data.length, perLabel, confused };
}

const rows = fs.readFileSync(src, "utf8").trim().split("\n").map(l => JSON.parse(l));
const all = rows.map(r => ({ set: r.set, x: features(r), y: LABELS.indexOf(r.label) })).filter(d => d.y >= 0);
const bySet = s => all.filter(d => d.set === s);
console.log(`samples: ${all.length} (gk ${bySet("gk").length}, ay ${bySet("ay").length})`);
const SIZES = [63, 128, 64, 26];

function report(name, res) {
  console.log(`${name}: ${(res.acc * 100).toFixed(1)}%`);
  const weak = res.perLabel.map(([r, n], i) => [LABELS[i], n ? r / n : 1]).filter(([, a]) => a < 0.85)
    .map(([l, a]) => `${l} ${(a * 100).toFixed(0)}%`);
  if (weak.length) console.log("  letters under 85%:", weak.join(", "));
  const top = Object.entries(res.confused).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`);
  if (top.length) console.log("  most confused:", top.join(", "));
}

// Cross-dataset check: learn from one set of hands, test on the other.
if (bySet("gk").length && bySet("ay").length) {
  let net = makeNet(SIZES);
  train(net, bySet("gk").slice(), 30);
  report("train on grassknoted, test on ayuraj", accuracy(net, bySet("ay")));
  net = makeNet(SIZES);
  train(net, bySet("ay").slice(), 120);
  report("train on ayuraj, test on grassknoted", accuracy(net, bySet("gk")));
}

// Random 85/15 split of everything, then the final model on all of it.
const shuffled = all.slice().sort(() => Math.random() - 0.5);
const cut = Math.floor(shuffled.length * 0.85);
let net = makeNet(SIZES);
train(net, shuffled.slice(0, cut), 40);
report("both sets, held-out 15%", accuracy(net, shuffled.slice(cut)));

net = makeNet(SIZES);
train(net, all.slice(), 40);
const r4 = v => Math.round(v * 1e4) / 1e4;
fs.writeFileSync(dest, JSON.stringify({
  labels: LABELS,
  trainedOn: { "grassknoted/asl-alphabet": bySet("gk").length, "ayuraj/asl-dataset": bySet("ay").length },
  layers: net.map(L => ({ in: L.in, out: L.out, w: Array.from(L.w, r4), b: Array.from(L.b, r4) })),
}));
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
