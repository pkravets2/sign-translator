// Step 1 of training the letter model.
// Serves the dataset images to tools/extract.html, which runs MediaPipe hand
// tracking on each one in the browser and posts the landmarks back here.
//
//   node tools/extract-server.js <data-dir> [port]
//
// <data-dir> holds the unzipped Kaggle datasets:
//   ay/asl_dataset/<a-z>/*.jpeg                              (ayuraj/asl-dataset)
//   gk/asl_alphabet_train/asl_alphabet_train/<A-Z>/*.jpg     (grassknoted/asl-alphabet)
// Landmarks are appended to <data-dir>/landmarks.jsonl.
const http = require("http"), fs = require("fs"), path = require("path");
const DATA = path.resolve(process.argv[2] || "data");
const PORT = Number(process.argv[3]) || 8772;
const OUT = path.join(DATA, "landmarks.jsonl");

function list() {
  const items = [];
  const sets = [["ay", "ay/asl_dataset"], ["gk", "gk/asl_alphabet_train/asl_alphabet_train"]];
  for (const [set, dir] of sets) {
    const root = path.join(DATA, dir);
    if (!fs.existsSync(root)) continue;
    for (const label of fs.readdirSync(root)) {
      if (!/^[a-z]$/i.test(label)) continue;
      for (const file of fs.readdirSync(path.join(root, label))) {
        items.push({ set, label: label.toUpperCase(), p: `${dir}/${label}/${file}` });
      }
    }
  }
  return items;
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(fs.readFileSync(path.join(__dirname, "extract.html")));
  }
  if (url.pathname === "/list") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(list()));
  }
  if (url.pathname === "/img") {
    const file = path.join(DATA, url.searchParams.get("p") || "");
    if (!file.startsWith(DATA)) { res.writeHead(403); return res.end(); }
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(data);
    });
  }
  if (url.pathname === "/save" && req.method === "POST") {
    let body = "";
    req.on("data", c => (body += c));
    return req.on("end", () => {
      const rows = JSON.parse(body);
      fs.appendFileSync(OUT, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
      res.writeHead(200); res.end("ok");
    });
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`extract server on http://localhost:${PORT} (data: ${DATA})`));
