const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = 8000;

const MIME = {
  js: "text/javascript",
  css: "text/css",
  html: "text/html",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain",
};

http
  .createServer((req, res) => {
    let url = decodeURIComponent(req.url);

    // Root -> main site
    if (url === "/") {
      return sendFile(res, path.join(root, "index.html"));
    }

    // Site static files
    if (url.startsWith("/js/") || url.startsWith("/css/") || url.startsWith("/images/") || url.startsWith("/assets/")) {
      return sendFile(res, path.join(root, url.slice(1)));
    }

    // Achievement SPA: /achievement/... handles both static and SPA routes
    if (url.startsWith("/achievement")) {
      const sub = url.slice("/achievement".length);

      // For static files (containing a dot extension)
      if (sub.includes("/") && sub.includes(".")) {
        return sendFile(res, path.join(root, "achievement", sub.slice(1)));
      }

      // For any other achievement routes (including root, dashboard, etc.), serve SPA's index.html
      return sendFile(res, path.join(root, "achievement", "index.html"));
    }

    // Everything else: try exact file, fallback to main index.html
    const filePath = path.join(root, url.slice(1));
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        return sendFile(res, path.join(root, "index.html"));
      }
      sendFile(res, filePath);
    });
  })
  .listen(port, () => {
    console.log(`http://localhost:${port}`);
  });

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 - Not Found: " + filePath);
      return;
    }
    const ext = path.extname(filePath).slice(1);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "text/plain",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}
