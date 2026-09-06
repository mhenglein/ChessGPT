#!/usr/bin/env node
/**
 * Frontend Build Script
 * Uses esbuild to bundle app/js/scripts.js for production
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const isWatch = process.argv.includes("--watch");
const isDev = process.argv.includes("--dev");

function writeSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://chessgpt.ai/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
  fs.writeFileSync(path.join(__dirname, "../public/sitemap.xml"), sitemap);
  console.log(`Sitemap written (lastmod=${today})`);
}

// Content-addressed music can be cached without serving stale replacements.
function writePage() {
  const mediaDir = path.join(__dirname, "../public/media");
  fs.mkdirSync(mediaDir, { recursive: true });
  for (const file of fs.readdirSync(mediaDir)) {
    if (/^(battle-intro|metal-music)\.[a-f0-9]{12}\.m4a$/.test(file)) {
      fs.unlinkSync(path.join(mediaDir, file));
    }
  }
  let html = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");
  for (const name of ["battle-intro", "metal-music"]) {
    const audio = fs.readFileSync(path.join(__dirname, `../app/assets/${name}.m4a`));
    const hash = createHash("sha256").update(audio).digest("hex").slice(0, 12);
    const filename = `${name}.${hash}.m4a`;
    fs.writeFileSync(path.join(mediaDir, filename), audio);
    html = html.replace(`{{${name}}}`, `/media/${filename}`);
  }
  fs.writeFileSync(path.join(__dirname, "../public/index.html"), html);
}

async function build() {
  try {
    writePage();
    const ctx = await esbuild.context({
      entryPoints: [path.join(__dirname, "../app/js/scripts.js")],
      bundle: true,
      outfile: path.join(__dirname, "../public/scripts.js"),
      format: "iife",
      minify: !isDev,
      sourcemap: isDev,
      target: ["es2020"],
      banner: {
        js: `// ChessGPT Frontend - Built ${new Date().toISOString()}\n`,
      },
      logLevel: "info",
    });

    if (isWatch) {
      await ctx.watch();
      console.log("Watching for changes...");
    } else {
      await ctx.rebuild();
      await ctx.dispose();
      writeSitemap();
      console.log("Build complete!");
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
