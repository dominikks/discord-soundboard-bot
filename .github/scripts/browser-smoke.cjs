const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  const root = path.resolve(process.argv[2]);
  const profile = path.resolve("artifact-smoke/chrome-profile");
  let infoRequests = 0;
  let userRequests = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/info") {
      infoRequests++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ version: "smoke", discordClientId: "100" }));
      return;
    }
    if (url.pathname === "/api/user") {
      userRequests++;
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthenticated fixture" }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404); res.end(); return;
    }
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(root, "index.html");
    }
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", type[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fs.mkdirSync(profile, { recursive: true });
  const chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
    "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking",
    "--no-first-run", "--no-default-browser-check",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
    `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=10000",
    `http://127.0.0.1:${server.address().port}/soundboard`,
  ], { stdio: ["pipe", "pipe", "pipe"] });
  chrome.stdin.end();
  let dom = "";
  let errors = "";
  chrome.stdout.on("data", data => { dom += data; });
  chrome.stderr.on("data", data => { errors += data; });
  const timeout = setTimeout(() => chrome.kill(), 45000);
  try {
    const code = await new Promise((resolve, reject) => {
      chrome.on("error", reject);
      chrome.on("close", resolve);
    });
    assert.equal(code, 0, errors);
    assert(infoRequests > 0, "Production app initializer must fetch app metadata");
    assert(userRequests > 0, "Production navigation must check authentication");
    assert.match(dom, /Soundboard Login/);
    assert.match(dom, /class="[^"]*login-button/);
    assert.match(dom, /href="\/api\/auth\/login"/);
    console.log("Packaged Angular app boots, resolves authentication and renders the real login route");
  } finally {
    clearTimeout(timeout);
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
