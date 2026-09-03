import assert from "node:assert/strict";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.PREVIEW_OUTPUT || "built/packaged/cm-microbit-platform");
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const indexPath = resolve(output, "index.html");
let index = readFileSync(indexPath, "utf8");
assert(index.includes("</body>"), "static package index has no body element");

// Strip anything a previous run injected so the script is idempotent.
index = index
    .replace(/<div id="inkybit-development-preview"[\s\S]*?<\/div>/g, "")
    .replace(/<style>\.blocklyTreeRow\[data-ns="cm"\][\s\S]*?<\/style>/g, "")
    .replace(/<link rel="stylesheet" href="\/cm-microbit-platform\/cm-toolbox\.css">/g, "")
    .replace(/<script src="\/cm-microbit-platform\/cm-branding\.js"><\/script>/g, "")
    .replace(/<script src="\/cm-microbit-platform\/cm-share\.js"><\/script>/g, "");

// Copy the CM share page, scripts and toolbox stylesheet beside the editor.
const staticFiles = [
    ["docs/static/share.html", "share.html"],
    ["docs/static/cm-share.js", "cm-share.js"],
    ["docs/static/cm-branding.js", "cm-branding.js"],
    ["docs/static/cm-toolbox.css", "cm-toolbox.css"]
];
for (const [source, destination] of staticFiles) {
    const from = resolve(root, source);
    if (existsSync(from)) copyFileSync(from, resolve(output, destination));
}

const toolboxStyle = `<link rel="stylesheet" href="/cm-microbit-platform/cm-toolbox.css">`;
const shareScript = `<script src="/cm-microbit-platform/cm-share.js"></script>`;
const brandingScript = `<script src="/cm-microbit-platform/cm-branding.js"></script>`;
index = index.replace("</body>", `${toolboxStyle}${brandingScript}${shareScript}</body>`);
writeFileSync(indexPath, index);

const manifest = {
    schemaVersion: 1,
    label: "Conductive Music MakeCode",
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
    },
    musicBlocks: {
        repository: pins.musicBlocks.repository,
        commit: pins.musicBlocks.commit
    }
};
writeFileSync(resolve(output, "inkybit-preview-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`finalized preview in ${output}`);
