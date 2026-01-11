#!/usr/bin/env node
/**
 * Frontend Build Script
 * Uses esbuild to bundle app/js/scripts.js for production
 */

const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const isDev = process.argv.includes("--dev");

async function build() {
  try {
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
      console.log("Build complete!");
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
