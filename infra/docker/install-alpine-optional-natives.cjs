#!/usr/bin/env node
/**
 * After `npm install` on macOS, the lockfile often omits Linux musl optional
 * natives (npm#4828). On Alpine images, install any missing optional deps that
 * match this CPU + musl so Next/Tailwind/sharp/etc. can resolve native bindings.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function isAlpineMuslLinux() {
  if (process.platform !== "linux") return false;
  try {
    const { familySync, MUSL } = require("detect-libc");
    return familySync() === MUSL;
  } catch {
    return fs.existsSync("/etc/alpine-release");
  }
}

function isMuslNativeOptional(depName) {
  if (depName.includes("wasm")) return false;

  const arch = process.arch;
  if (arch === "x64") {
    return (
      depName.includes("-linux-x64-musl") ||
      depName.includes("linuxmusl-x64") ||
      depName.includes("linuxmusl_x64")
    );
  }
  if (arch === "arm64") {
    return (
      depName.includes("-linux-arm64-musl") ||
      depName.includes("linuxmusl-arm64") ||
      depName.includes("linuxmusl_arm64")
    );
  }
  return false;
}

const nmRoot = path.join(process.cwd(), "node_modules");

function walkNodeModules(rootNm, acc) {
  if (!fs.existsSync(rootNm)) return;
  for (const name of fs.readdirSync(rootNm)) {
    if (name === ".bin" || name === ".cache") continue;
    const full = path.join(rootNm, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    if (name.startsWith("@")) {
      for (const sub of fs.readdirSync(full)) {
        const pkgDir = path.join(full, sub);
        let st2;
        try {
          st2 = fs.statSync(pkgDir);
        } catch {
          continue;
        }
        if (!st2.isDirectory()) continue;
        const pj = path.join(pkgDir, "package.json");
        if (fs.existsSync(pj)) acc.push(pj);
        const nested = path.join(pkgDir, "node_modules");
        if (fs.existsSync(nested)) walkNodeModules(nested, acc);
      }
    } else {
      const pj = path.join(full, "package.json");
      if (fs.existsSync(pj)) acc.push(pj);
      const nested = path.join(full, "node_modules");
      if (fs.existsSync(nested)) walkNodeModules(nested, acc);
    }
  }
}

function isInstalled(depName) {
  const parts = depName.split("/");
  const dir =
    parts[0].startsWith("@") && parts.length >= 2
      ? path.join(nmRoot, parts[0], parts[1])
      : path.join(nmRoot, depName);
  return fs.existsSync(path.join(dir, "package.json"));
}

if (!isAlpineMuslLinux()) {
  console.log("Skipping Alpine musl optional natives (not Linux musl).");
  process.exit(0);
}

const pkgJsonFiles = [];
walkNodeModules(nmRoot, pkgJsonFiles);

const toInstall = new Map();
for (const pj of pkgJsonFiles) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(pj, "utf8"));
  } catch {
    continue;
  }
  const od = j.optionalDependencies;
  if (!od || typeof od !== "object") continue;
  for (const [depName, depVersion] of Object.entries(od)) {
    if (!isMuslNativeOptional(depName)) continue;
    if (isInstalled(depName)) continue;
    toInstall.set(depName, depVersion);
  }
}

if (toInstall.size === 0) {
  console.log("No missing musl optional native packages to install.");
  process.exit(0);
}

const specs = [...toInstall.entries()].map(([n, v]) => `${n}@${v}`);
console.log("Installing missing musl optional natives:\n ", specs.join("\n  "));

const chunkSize = 12;
for (let i = 0; i < specs.length; i += chunkSize) {
  const batch = specs.slice(i, i + chunkSize);
  const r = spawnSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--no-save", ...batch],
    { stdio: "inherit", cwd: process.cwd(), env: process.env, shell: false },
  );
  if (r.status !== 0 && r.status != null) process.exit(r.status);
  if (r.error) throw r.error;
}
