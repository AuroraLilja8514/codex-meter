// Downloads the signed XPI for the current manifest version from AMO.
// Prereqs: AMO_API_KEY / AMO_API_SECRET set (e.g. via amo-credentials.ps1).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const key = process.env.AMO_API_KEY;
const secret = process.env.AMO_API_SECRET;
if (!key || !secret) throw new Error("Set AMO_API_KEY and AMO_API_SECRET first.");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "codex-meter-extension", "manifest.json"), "utf8"));
const id = manifest.browser_specific_settings.gecko.id;
const version = manifest.version;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64url(JSON.stringify({ iss: key, iat: now - 10, exp: now + 240 }));
const sig = b64url(crypto.createHmac("sha256", secret).update(header + "." + payload).digest());
const jwt = header + "." + payload + "." + sig;

const api = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/versions/${version}/`;

const makeJwt = () => {
  const t = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ iss: key, iat: t - 10, exp: t + 240 }));
  const s = b64url(crypto.createHmac("sha256", secret).update(h + "." + p).digest());
  return `${h}.${p}.${s}`;
};

const fetchVersion = async () => {
  const res = await fetch(api, { headers: { Authorization: `JWT ${makeJwt()}` } });
  const body = await res.json();
  if (!res.ok) {
    console.error("API error", res.status, JSON.stringify(body).slice(0, 800));
    process.exit(1);
  }
  return body;
};

(async () => {
  // Wait for AMO auto-signing: the file is only served signed once its
  // status flips to "public" (before that, file.url returns the raw upload).
  let body;
  for (let i = 0; i < 30; i++) {
    body = await fetchVersion();
    const status = body && body.file ? body.file.status : "?";
    console.log("file status:", status);
    if (status === "public") break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  const file = body && body.file;
  if (!file || !file.url || file.status !== "public") {
    console.error("Signed file not ready yet.");
    process.exit(1);
  }
  console.log("version:", version, "| channel:", body.channel);
  const dl = await fetch(file.url, { headers: { Authorization: `JWT ${makeJwt()}` } });
  if (!dl.ok) { console.error("Download failed", dl.status); process.exit(1); }
  const buf = Buffer.from(await dl.arrayBuffer());
  const outDir = path.join(__dirname, "web-ext-artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `codex_meter-${version}-signed.xpi`);
  fs.writeFileSync(out, buf);
  console.log("saved:", out, "(" + buf.length + " bytes)");
})();