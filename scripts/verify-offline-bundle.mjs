import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ not found. Run npm run build first.");
  process.exit(1);
}

const offenders = [];
for (const file of walk(distDir)) {
  if (!/\.(html|js|css)$/i.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");

  if (/\.html$/i.test(file)) {
    const externalAssets =
      text.match(/<(?:script|link|img|iframe)\b[^>]+(?:src|href)=["']https?:\/\//gi) ?? [];
    for (const asset of externalAssets) {
      offenders.push(`${path.relative(process.cwd(), file)} -> external asset: ${asset}`);
    }
  }

  if (/\.js$/i.test(file)) {
    const networkCalls =
      text.match(/\b(?:fetch|WebSocket|EventSource)\s*\(\s*["']https?:\/\//g) ?? [];
    for (const call of networkCalls) {
      offenders.push(`${path.relative(process.cwd(), file)} -> network call: ${call}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("Offline bundle check failed:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}

console.log("✓ offline bundle check passed");
