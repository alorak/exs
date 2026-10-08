import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const out = path.join(root, "_site");
const mathliveRoot = path.join(root, "node_modules", "mathlive");

const requiredMathLive = [
  path.join(mathliveRoot, "mathlive.min.js"),
  path.join(mathliveRoot, "fonts")
];

for (const required of requiredMathLive) {
  if (!fs.existsSync(required)) {
    throw new Error(
      `Missing MathLive runtime asset: ${required}. Run npm install first.`
    );
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const copyFile = (relativePath) => {
  const source = path.join(root, relativePath);
  const destination = path.join(out, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

for (const file of [
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  ".nojekyll",
  "icons/exs.svg"
]) {
  copyFile(file);
}

const vendorDir = path.join(out, "vendor", "mathlive");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(
  path.join(mathliveRoot, "mathlive.min.js"),
  path.join(vendorDir, "mathlive.min.js")
);

const licenseCandidates = ["LICENSE.txt", "LICENSE", "LICENSE.md"];
for (const candidate of licenseCandidates) {
  const source = path.join(mathliveRoot, candidate);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(vendorDir, candidate));
    break;
  }
}

// MathLive resolves its default fonts/sounds relative to the document.
// Keep these directories at the site root so the runtime performs only
// same-origin requests and remains fully functional without the internet.
fs.cpSync(path.join(mathliveRoot, "fonts"), path.join(out, "fonts"), {
  recursive: true
});

const soundsDir = path.join(mathliveRoot, "sounds");
if (fs.existsSync(soundsDir)) {
  fs.cpSync(soundsDir, path.join(out, "sounds"), { recursive: true });
}

const forbiddenRuntimeHosts = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
  "esm.run"
];

for (const file of ["index.html", "app.js", "styles.css"]) {
  const content = fs.readFileSync(path.join(out, file), "utf8");
  for (const host of forbiddenRuntimeHosts) {
    if (content.includes(host)) {
      throw new Error(`Offline audit failed: ${file} still references ${host}`);
    }
  }
}

function walkFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(fullPath));
    else if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

const filesBeforeServiceWorker = walkFiles(out)
  .filter((file) => path.basename(file) !== "sw.js")
  .sort();

const digest = crypto.createHash("sha256");
for (const file of filesBeforeServiceWorker) {
  digest.update(path.relative(out, file).replaceAll(path.sep, "/"));
  digest.update(fs.readFileSync(file));
}
const cacheId = digest.digest("hex").slice(0, 16);

const precache = [
  "./",
  ...filesBeforeServiceWorker.map(
    (file) => "./" + path.relative(out, file).replaceAll(path.sep, "/")
  )
];

const serviceWorker = `const CACHE_NAME = "exs-offline-${cacheId}";
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("exs-offline-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
`;

fs.writeFileSync(path.join(out, "sw.js"), serviceWorker, "utf8");

console.log(
  `Built fully offline EXS site: ${filesBeforeServiceWorker.length + 1} files, cache ${cacheId}`
);
