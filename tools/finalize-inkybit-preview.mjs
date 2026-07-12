import assert from "node:assert/strict";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.PREVIEW_OUTPUT || "built/packaged/pxt-microbit");
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const indexPath = resolve(output, "index.html");
let index = readFileSync(indexPath, "utf8");
assert(index.includes("</body>"), "static package index has no body element");

// Copy CM share page and custom share script to the output
const shareSrc = resolve(root, "docs/static/share.html");
const shareScriptSrc = resolve(root, "docs/static/cm-share.js");
if (existsSync(shareSrc)) {
    copyFileSync(shareSrc, resolve(output, "share.html"));
}
if (existsSync(shareScriptSrc)) {
    copyFileSync(shareScriptSrc, resolve(output, "cm-share.js"));
}

const banner = `<div id="inkybit-development-preview" role="status" style="position:fixed;z-index:2147483647;left:0;right:0;bottom:0;padding:8px 12px;background:#00A651;color:white;font:700 14px sans-serif;text-align:center;box-shadow:0 -2px 5px #0006">Conductive Music MakeCode - Inky:Bit Image Editor</div>`;
const shareScript = `<script src="/pxt-microbit/cm-share.js"></script>`;
index = index.replace("</body>", `${banner}${shareScript}</body>`);
writeFileSync(indexPath, index);

const manifest = {
    schemaVersion: 1,
    label: "Conductive Music MakeCode - Inky:Bit Image Editor",
    target: {
        repository: pins.target.repository,
        commit: process.env.PREVIEW_TARGET_SHA || "LOCAL_WORKTREE",
        upstreamCommit: pins.target.upstreamCommit,
        pxtCore: pins.target.pxtCore,
        pxtCommonPackages: pins.target.pxtCommonPackages
    },
    extension: {
        repository: pins.extension.repository,
        commit: pins.extension.commit
    }
};
writeFileSync(resolve(output, "inkybit-preview-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`finalized preview in ${output}`);
