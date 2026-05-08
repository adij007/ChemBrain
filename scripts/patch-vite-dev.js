const fs = require("node:fs");
const path = require("node:path");

const vitePackagePath = require.resolve("vite/package.json", {
  paths: [process.cwd()],
});
const viteConfigPath = path.join(path.dirname(vitePackagePath), "dist", "node", "chunks", "config.js");

const source = fs.readFileSync(viteConfigPath, "utf8");
const target = "JSON.stringify(output.imports)";
const replacement = "JSON.stringify((output || { imports: [] }).imports)";

if (source.includes(replacement)) {
  process.exit(0);
}

if (!source.includes(target)) {
  console.warn(`[patch-vite-dev] Expected optimizer marker not found in ${path.relative(process.cwd(), viteConfigPath)}.`);
  process.exit(0);
}

fs.writeFileSync(viteConfigPath, source.replace(target, replacement));
console.log(`[patch-vite-dev] Patched ${path.relative(process.cwd(), viteConfigPath)} for Windows/Node 24 dev optimizer metadata.`);
