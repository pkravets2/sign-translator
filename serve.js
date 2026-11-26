// Tiny static server: node serve.js  ->  http://localhost:8771
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 8771;
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
};
http.createServer((req, res) => {
  const route = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(__dirname, route === "/" ? "index.html" : route);
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`The Goblet of Fire is running at http://localhost:${PORT}`));
