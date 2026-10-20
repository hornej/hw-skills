// All executable code and language data ship inside the extension, never from a CDN at runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const destination = path.resolve(__dirname, "../vendor/ocr");
fs.mkdirSync(destination, { recursive: true });
const hashes = {};
function copy(packageName, from, to) {
  const packageRoot = path.dirname(require.resolve(packageName + "/package.json"));
  const bytes = fs.readFileSync(path.join(packageRoot, from));
  fs.writeFileSync(path.join(destination, to), bytes);
  hashes[to] = crypto.createHash("sha256").update(bytes).digest("hex");
}
copy("tesseract.js", "dist/tesseract.min.js", "tesseract.min.js");
copy("tesseract.js", "dist/worker.min.js", "worker.min.js");
copy("tesseract.js", "LICENSE.md", "LICENSE-tesseract.txt");
copy("tesseract.js-core", "LICENSE", "LICENSE-core.txt");
// OEM 1 always selects an LSTM core. Include all CPU feature variants for that engine.
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  const name = `tesseract-core-${variant}.wasm.js`;
  copy("tesseract.js-core", name, name);
}
copy("@tesseract.js-data/eng", "4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz");
copy("@tesseract.js-data/eng", "README.md", "README-language.md");
fs.writeFileSync(path.join(destination, "SHA256.json"), JSON.stringify(hashes, null, 2) + "\n");
console.log("Bundled OCR assets:", Object.keys(hashes).length);
