#!/usr/bin/env node
/**
 * patch-app-asar.mjs — 為 VoiceStudio 的語言下拉選單加入 Cantonese（yue）
 *
 * 為什麼不能直接修改 bytes？
 *   app.asar 的 header 是一個約 14MB 的 JSON index，其中包含：
 *     1. 每個檔案的 SHA256 integrity hash
 *     2. 每個檔案在 data section 中的 byte offset（五萬多個檔案）
 *   插入 bytes 會令後續 offset 全部移位，hash 也不再吻合 —
 *   所以必須使用正規 asar 工具 extract → 修改 → repack，由它自動重算。
 *
 * 用法：
 *   node scripts/patch-app-asar.mjs [path/to/app.asar]
 *
 * 行為：
 *   - 自動備份為 app.asar.original（如果尚無備份）
 *   - 以內容特徵查找目標 JS（檔名帶有 build hash，每個版本都不同）
 *   - 已經修改過就直接跳過（idempotent）
 *   - repack 之後列印新檔案的 size / sha256 供核對
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync,
         rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const YUE_CODE = "yue";
const YUE_LABEL = "Cantonese";

// 目標語言清單的錨點：Catalan entry。以內容而非檔名來查找，
// 因為 index-XXXXXXXX.js 的 hash 後綴每個 build 都不同。
const CA_ENTRY = /\{\s*code:\s*"ca"\s*,\s*label:\s*"Catalan"\s*\}/;
const YUE_PRESENT = /code:[\t ]*"yue"/;

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts })
    .toString("utf-8");
}

/** 以 npx 執行 @electron/asar（避免要求使用者先行全域安裝）。 */
function asar(args) {
  try {
    return sh("npx", ["--yes", "@electron/asar", ...args]);
  } catch {
    // 某些環境的 npx 是 .ps1，直接呼叫會被 Execution Policy 攔截 — 改走 cmd
    return sh("cmd", ["/c", "npx", "--yes", "@electron/asar", ...args]);
  }
}

/** 純文字轉換：在 Catalan entry 之前插入 yue entry。回傳新內容。 */
export function insertCantonese(src) {
  if (YUE_PRESENT.test(src)) return null;           // 已經修改過
  const m = src.match(CA_ENTRY);
  if (!m) throw new Error('找不到錨點 label: "Catalan" — VoiceStudio 版本可能已改變語言清單結構');

  // 行尾須與原檔一致（有些 build 是 CRLF），否則 repack 出來會產生 43 bytes 以外的差異
  const eol = m[0].includes("\r\n") ? "\r\n" : "\n";

  // 由 match 起點回溯至行首取得 indent，如此插入的 entry 才會對齊
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

/** 遞迴找出所有含錨點的檔案路徑。 */
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
    console.error(`✖ 路徑不存在：${asarPath}`);
    process.exit(1);
  }

  // 1) 備份
  const backup = `${asarPath}.original`;
  if (!existsSync(backup)) {
    copyFileSync(asarPath, backup);
    console.log(`✔ 已備份 → ${backup}`);
  } else {
    console.log(`• 備份已存在，不予覆蓋 → ${backup}`);
  }

  // 2) extract
  const work = mkdtempSync(join(tmpdir(), "vs-asar-"));
  try {
    console.log("• extract …");
    asar(["extract", asarPath, work]);

    // 3) 查找 + 修改
    const targets = findTargetFiles(work);
    if (targets.length === 0) {
      console.log("• 未找到需要修改的檔案 — 可能已經 patch 過，或語言清單結構已變動");
      return;
    }
    if (targets.length > 1) {
      console.warn(`⚠ 找到 ${targets.length} 個候選，只修改第一個：`);
      targets.forEach((t) => console.warn(`   ${t}`));
    }
    const target = targets[0];
    const before = readFileSync(target, "utf-8");
    const after = insertCantonese(before);
    if (after === null) { console.log("• 已經 patch 過"); return; }
    writeFileSync(target, after, "utf-8");
    const delta = Buffer.byteLength(after, "utf-8") - Buffer.byteLength(before, "utf-8");
    console.log(`✔ 已加入 {code:"${YUE_CODE}", label:"${YUE_LABEL}"} → ${target.replace(work + "/", "")}  (+${delta} bytes)`);

    // 4) repack（asar 自動重算 integrity hash 與 offset）
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
    console.log("\n⚠ 請完全退出 VoiceStudio（確保後端 process 已結束）後再重新啟動才生效。");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("patch-app-asar.mjs")) {
  main();
}
