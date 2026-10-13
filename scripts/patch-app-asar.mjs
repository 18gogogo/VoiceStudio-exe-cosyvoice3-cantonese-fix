#!/usr/bin/env node
/**
 * patch-app-asar.mjs — 為 VoiceStudio 嘅語言下拉加返 Cantonese（yue）
 *
 * 點解唔可以直接改 bytes？
 *   app.asar 嘅 header 係一個 ~14MB 嘅 JSON index，入面有：
 *     1. 每個檔案嘅 SHA256 integrity hash
 *     2. 每個檔案喺 data section 嘅 byte offset（五萬幾個檔案）
 *   插入 bytes 會令後續 offset 全部移位，hash 亦唔再吻合 —
 *   所以必須用正規 asar 工具 extract → 改 → repack，等佢自動重算。
 *
 * 用法：
 *   node scripts/patch-app-asar.mjs [path/to/app.asar]
 *
 * 行為：
 *   - 自動備份做 app.asar.original（如果未有備份）
 *   - 用內容特徵搵目標 JS（檔案名帶 build hash，每個版本都唔同）
 *   - 已經改過就直接跳過（idempotent）
 *   - repack 之後列印新檔案嘅 size / sha256 供核對
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
         rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const YUE_CODE = "yue";
const YUE_LABEL = "Cantonese";

// 目標語言清單嘅錨點：Catalan entry。用內容而唔係檔案名去搵，
// 因為 index-XXXXXXXX.js 嘅 hash 後綴每個 build 都唔同。
const CA_ENTRY = /\{\s*code:\s*"ca"\s*,\s*label:\s*"Catalan"\s*\}/;
const YUE_PRESENT = /code:[\t ]*"yue"/;

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts })
    .toString("utf-8");
}

/** 用 npx 跑 @electron/asar（避免要求使用者先全域安裝）。 */
function asar(args) {
  try {
    return sh("npx", ["--yes", "@electron/asar", ...args]);
  } catch {
    // 某啲環境 npx 係 .ps1，直接 call 會被 Execution Policy 擋 — 改走 cmd
    return sh("cmd", ["/c", "npx", "--yes", "@electron/asar", ...args]);
  }
}

/** 純文字轉換：喺 Catalan entry 之前插入 yue entry。回傳新內容。 */
export function insertCantonese(src) {
  if (YUE_PRESENT.test(src)) return null;           // 已經改過
  const m = src.match(CA_ENTRY);
  if (!m) throw new Error('搵唔到錨點 label: "Catalan" — VoiceStudio 版本可能已改變語言清單結構');

  // 行尾要跟返原檔（有啲 build 係 CRLF），否則 repack 出嚟會多咗 43 bytes 以外嘅差異
  const eol = m[0].includes("\r\n") ? "\r\n" : "\n";

  // 由 match 開頭行首攞返 indent，咁插入嘅 entry 先對得齊
  const at = m.index;
  const lineStart = src.lastIndexOf("\n", at) + 1;
  const indent = src.slice(lineStart, at).match(/^[\t ]*/)[0];

  const entry =
    `${indent}{${eol}` +
    `${indent}\tcode: "${YUE_CODE}",${eol}` +
    `${indent}\tlabel: "${YUE_LABEL}"${eol}` +
    `${indent}},${eol}`;

  return src.slice(0, lineStart) + entry + src.slice(lineStart);
}

/** 遞迴搵出所有含錨點嘅檔案路徑。 */
function findTargetFiles(root) {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|cjs|json|html)$/.test(name)) continue;
      let text;
      try { text = readFileSync(p, "utf-8"); } catch { continue; }
      if (CA_ENTRY.test(text) && !YUE_PRESENT.test(text)) hits.push(p);
    }
  };
  walk(root);
  return hits;
}

function main() {
  const asarPath = resolve(process.argv[2] ?? "app.asar");
  if (!existsSync(asarPath)) {
    console.error(`✖ 唔存在：${asarPath}`);
    process.exit(1);
  }

  // 1) 備份
  const backup = `${asarPath}.original`;
  if (!existsSync(backup)) {
    copyFileSync(asarPath, backup);
    console.log(`✔ 已備份 → ${backup}`);
  } else {
    console.log(`• 備份已存在，唔覆蓋 → ${backup}`);
  }

  // 2) extract
  const work = mkdtempSync(join(tmpdir(), "vs-asar-"));
  try {
    console.log("• extract …");
    asar(["extract", asarPath, work]);

    // 3) 搵 + 改
    const targets = findTargetFiles(work);
    if (targets.length === 0) {
      console.log("• 冇搵到需要修改嘅檔案 — 可能已經 patch 過，或者語言清單已改動");
      return;
    }
    if (targets.length > 1) {
      console.warn(`⚠ 搵到 ${targets.length} 個候選，只改第一個：`);
      targets.forEach((t) => console.warn(`   ${t}`));
    }
    const target = targets[0];
    const before = readFileSync(target, "utf-8");
    const after = insertCantonese(before);
    if (after === null) { console.log("• 已經 patch 過"); return; }
    writeFileSync(target, after, "utf-8");
    const delta = Buffer.byteLength(after, "utf-8") - Buffer.byteLength(before, "utf-8");
    console.log(`✔ 已加入 {code:"${YUE_CODE}", label:"${YUE_LABEL}"} → ${target.replace(work + "/", "")}  (+${delta} bytes)`);

    // 4) repack（asar 自動重算 integrity hash 同 offset）
    console.log("• repack …");
    const out = `${asarPath}.new`;
    rmSync(out, { force: true });
    asar(["pack", work, out]);
    copyFileSync(out, asarPath);
    rmSync(out, { force: true });

    // 5) 核對
    const sum = createHash("sha256").update(readFileSync(asarPath)).digest("hex");
    console.log(`✔ 完成 — ${asarPath}`);
    console.log(`   size  : ${statSync(asarPath).size} bytes`);
    console.log(`   sha256: ${sum}`);
    console.log("\n⚠ 記得完全退出 VoiceStudio（確保後端 process 已結束）再重啟先生效。");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("patch-app-asar.mjs")) {
  main();
}
