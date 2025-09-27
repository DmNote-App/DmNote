#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const builtPath = path.join(projectRoot, "dist", "main", "main", "main.js");

function collectFiles(dir, exts, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectFiles(full, exts, files);
    } else if (exts.includes(path.extname(e.name))) {
      files.push(full);
    }
  }
  return files;
}

function needsBuild() {
  if (!fs.existsSync(builtPath)) {
    console.log("[ensure-main-built] built file not found:", builtPath);
    return true;
  }
  let builtMtime;
  try {
    builtMtime = fs.statSync(builtPath).mtimeMs;
  } catch (err) {
    return true;
  }
  const srcDir = path.join(projectRoot, "src", "main");
  const files = collectFiles(srcDir, [".ts", ".tsx", ".js", ".jsx"]);
  for (const f of files) {
    try {
      const m = fs.statSync(f).mtimeMs;
      if (m > builtMtime) {
        console.log("[ensure-main-built] source changed:", f);
        return true;
      }
    } catch (err) {
      return true;
    }
  }
  return false;
}

if (!needsBuild()) {
  console.log("[ensure-main-built] build is up-to-date, skipping tsc.");
  process.exit(0);
}

// Find tsc entry script
const tscLib = path.join(
  projectRoot,
  "node_modules",
  "typescript",
  "lib",
  "tsc.js"
);
const tscBin = path.join(
  projectRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc"
);
let cmd, args;
if (fs.existsSync(tscLib)) {
  cmd = process.execPath; // node
  args = [tscLib, "-p", "tsconfig.main.json"];
} else if (fs.existsSync(tscBin)) {
  // bin/tsc may be a JS file with shebang
  cmd = process.execPath;
  args = [tscBin, "-p", "tsconfig.main.json"];
} else {
  // fallback to npx
  cmd = "npx";
  args = ["tsc", "-p", "tsconfig.main.json"];
}

console.log("[ensure-main-built] running:", cmd, args.join(" "));
const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
if (res.error) {
  console.error("[ensure-main-built] spawn error:", res.error);
  process.exit(1);
}
if (res.status !== 0) {
  console.error("[ensure-main-built] tsc failed with code", res.status);
  process.exit(res.status || 1);
}
console.log("[ensure-main-built] tsc finished successfully.");
process.exit(0);
