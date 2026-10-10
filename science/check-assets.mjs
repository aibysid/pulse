import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
const base = path.resolve("public/assets/model");
const m = JSON.parse(fs.readFileSync(path.join(base, "manifest.json")));
if (m.schemaVersion !== 1) throw Error("Invalid schema");
let bytes = 0;
for (const [name, info] of Object.entries(m.files)) {
  const b = fs.readFileSync(path.join(base, name));
  bytes += b.length;
  if (
    b.length !== info.bytes ||
    crypto.createHash("sha256").update(b).digest("hex") !== info.sha256
  )
    throw Error("Invalid checksum " + name);
}
const report = JSON.parse(fs.readFileSync(path.join(base, "validation.json")));
if (
  report.maximumErrorSeconds > 2 ||
  report.seededRandomValidation.maximumErrorSeconds > 2
)
  throw Error("Numerical validation failed");
if (bytes > 8 * 1024 * 1024) throw Error("Model size exceeds budget");
const a = JSON.parse(fs.readFileSync("public/assets/provenance.json"));
for (const item of a.assets) {
  const b = fs.readFileSync("public/assets/" + item.file);
  if (crypto.createHash("sha256").update(b).digest("hex") !== item.sha256)
    throw Error("Invalid asset " + item.file);
}
console.log(
  `Validated ${m.modelVersion}: ${bytes} bytes; ${report.acceptedCells} accepted phase cells; checksums passed.`,
);
