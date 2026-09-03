/**
 * Local CORS proxy for Flutter web → production admin-api.
 * Usage: node tools/cors_proxy.js
 */
const http = require("http");
const https = require("https");
const zlib = require("zlib");

const PORT = Number(process.env.PROXY_PORT || 5055);
const TARGET_HOST =
  process.env.PROXY_TARGET || "clicks-admin-api-production.up.railway.app";

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  setCors(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const headers = { ...req.headers, host: TARGET_HOST };
  delete headers.origin;
  // Ask for plain JSON so we don't fight browser gzip decoding
  headers["accept-encoding"] = "identity";

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (body.length) headers["content-length"] = String(body.length);
    else delete headers["content-length"];

    const upstream = https.request(
      {
        hostname: TARGET_HOST,
        path: req.url,
        method: req.method,
        headers,
      },
      (pr) => {
        const encoding = (pr.headers["content-encoding"] || "").toLowerCase();
        let stream = pr;
        if (encoding === "gzip") stream = pr.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = pr.pipe(zlib.createInflate());
        else if (encoding === "br") stream = pr.pipe(zlib.createBrotliDecompress());

        const out = [];
        stream.on("data", (c) => out.push(c));
        stream.on("end", () => {
          const buf = Buffer.concat(out);
          const outHeaders = {
            "content-type": pr.headers["content-type"] || "application/json",
            "content-length": String(buf.length),
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-headers":
              "Authorization, Content-Type, Accept",
            "access-control-allow-methods":
              "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          };
          res.writeHead(pr.statusCode || 502, outHeaders);
          res.end(buf);
          console.log(`${req.method} ${req.url} -> ${pr.statusCode}`);
        });
        stream.on("error", (err) => {
          console.error("stream error", err.message);
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ message: "Proxy decode error", error: err.message }));
        });
      }
    );

    upstream.on("error", (err) => {
      console.error("upstream error", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ message: "Proxy error", error: err.message }));
    });

    if (body.length) upstream.write(body);
    upstream.end();
  });
});

server.listen(PORT, () => {
  console.log(`CORS proxy http://localhost:${PORT} → https://${TARGET_HOST}`);
});
