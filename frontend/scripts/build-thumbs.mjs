// Build small WebP thumbnails of the player portraits and club crests.
//
// Portraits are 160px PNGs (median 31 KB, some over 500 KB) but are shown at 28-52px.
// PlayerAvatar and ClubBadge load /media/thumbs/<folder>/<name>.webp first and fall back to the
// original, so an image added later still works before this script is run again.
//
// Usage (from frontend/): node scripts/build-thumbs.mjs
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "media");
// [source folder, longest side in px]: portraits show at up to 52px, crests at up to 20px.
const SETS = [
  ["players", 112],
  ["clubs", 48],
];

let built = 0;
let skipped = 0;
let bytesIn = 0;
let bytesOut = 0;
for (const [folder, size] of SETS) {
  const src = path.join(root, folder);
  const out = path.join(root, "thumbs", folder);
  await mkdir(out, { recursive: true });
  for (const file of await readdir(src)) {
    if (!file.toLowerCase().endsWith(".png")) continue;
    const from = path.join(src, file);
    const to = path.join(out, file.replace(/\.png$/i, ".webp"));
    const a = await stat(from);
    const b = await stat(to).catch(() => null);
    bytesIn += a.size;
    if (b && b.mtimeMs >= a.mtimeMs) {
      skipped += 1;
      bytesOut += b.size;
      continue;
    }
    await sharp(from)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 78, alphaQuality: 85 })
      .toFile(to);
    bytesOut += (await stat(to)).size;
    built += 1;
  }
}
console.log(
  `thumbs: ${built} built, ${skipped} up to date. ${(bytesIn / 1e6).toFixed(1)} MB -> ${(bytesOut / 1e6).toFixed(1)} MB`,
);
