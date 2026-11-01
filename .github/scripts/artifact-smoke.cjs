const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /<app-root>/);
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
assert(assets.some(asset => asset.endsWith(".js")), "Packaged application needs JavaScript");
assert(assets.some(asset => asset.endsWith(".css")), "Packaged application needs styles");
for (const asset of assets) {
  assert(!asset.includes("..") && !asset.includes("://"), "Expected local production assets");
  assert(fs.statSync(path.join(root, asset)).size > 0, `Missing packaged asset: ${asset}`);
}
console.log(`Production index and ${assets.length} referenced assets verified`);
