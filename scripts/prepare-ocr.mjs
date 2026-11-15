import { copyFile, mkdir } from "node:fs/promises";

const target = new URL("../public/ocr/", import.meta.url);
const assets = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz", "chi_sim.traineddata.gz"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];

await mkdir(target, { recursive: true });
await Promise.all(assets.map(([source, name]) =>
  copyFile(new URL("../node_modules/" + source, import.meta.url), new URL(name, target))));
