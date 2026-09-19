// Production build: minify + mangle everything served, so the deployed app
// exposes no readable source. The readable code lives only in this private repo.
import { minify } from "terser";
import { minify as cssoMinify } from "csso";
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from "fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/data", { recursive: true });

const terserOpts = {
  compress: { passes: 2, drop_console: false },
  mangle: true,
  format: { comments: false },
};

for (const f of ["app.js", "bg.js", "sw.js", "data/freemasonry-circle.js"]) {
  const out = await minify(readFileSync(f, "utf8"), terserOpts);
  if (!out.code) throw new Error("terser produced no output for " + f);
  writeFileSync("dist/" + f, out.code);
  console.log("minified", f);
}

writeFileSync("dist/styles.css", cssoMinify(readFileSync("styles.css", "utf8")).css);

// HTML: strip comments and collapse blank lines; markup itself must survive intact.
let html = readFileSync("index.html", "utf8");
html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n");
writeFileSync("dist/index.html", html);

cpSync("manifest.webmanifest", "dist/manifest.webmanifest");
cpSync("icons", "dist/icons", { recursive: true });
cpSync("assets", "dist/assets", { recursive: true });
console.log("build complete -> dist/");
