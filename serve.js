// Tiny static server: node serve.js  ->  http://localhost:8771
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 8771;
http.createServer((req, res) => {
  const file = path.join(__dirname, decodeURIComponent(req.url.split("?")[0]) === "/" ? "sign-translator.html" : decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const types = { ".html": "text/html", ".svg": "image/svg+xml", ".js": "text/javascript" };
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Sign translator running at http://localhost:${PORT}`));
