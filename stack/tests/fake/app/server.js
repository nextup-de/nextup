// Fake nextup-app: writes nothing, needs no capability, listens on 3000.
const http = require("node:http");

const version = process.env.FAKE_VERSION || "unknown";

http
  .createServer((req, res) => {
    const path = (req.url || "/").split("?")[0];
    res.setHeader("content-type", "text/plain");
    if (path === "/api/health") return res.end("ok");
    if (path === "/") return res.end(`fake ${version}`);
    res.statusCode = 404;
    res.end("not found");
  })
  .listen(3000, "0.0.0.0");
