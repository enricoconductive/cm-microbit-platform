import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const targetPath = resolve(root, "pxtarget.json");
const target = JSON.parse(readFileSync(targetPath, "utf8"));

// Every extension that the platform bundles from its own GitHub repository.
// Each one is checked out at the commit pinned in inkybit-toolchain.json.
const extensions = [
    {
        label: "cm-inkybit",
        relative: "libs/inkybit",
        dir: resolve(root, process.env.INKYBIT_EXTENSION_DIR || "libs/inkybit"),
        pin: pins.extension
    },
    {
        label: "cm-music-blocks",
        relative: "libs/cm-music-blocks",
        dir: resolve(root, process.env.CM_MUSIC_BLOCKS_DIR || "libs/cm-music-blocks"),
        pin: pins.musicBlocks
    }
];

for (const extension of extensions) {
    const head = execFileSync("git", ["-C", extension.dir, "rev-parse", "HEAD"], {
        encoding: "utf8"
    }).trim();
    assert.equal(head, extension.pin.commit, `checked-out ${extension.label} does not match toolchain pin`);

    // Bundled target packages resolve sibling core packages by file path. This
    // is the only preview-specific rewrite; all extension source files remain
    // at the verified commit above.
    const configPath = resolve(extension.dir, "pxt.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.dependencies.core = "file:../core";
    writeFileSync(configPath, JSON.stringify(config, null, 4) + "\n");

    assert(target.bundleddirs.includes(extension.relative), `${extension.label} must be bundled in the platform`);
}

const bundledExtensions = extensions.map(extension => extension.relative);
target.staticpkgdirs = {
    base: target.bundleddirs.filter(pkg => !bundledExtensions.includes(pkg)),
    extensions: bundledExtensions
};
target.name = "Conductive Music MakeCode";
target.title = "Conductive Music MakeCode for micro:bit";
target.description = "A Blocks / JavaScript code editor for the micro:bit powered by Conductive Music.";
target.appTheme.organization = "Conductive Music";
target.appTheme.homeUrl = "https://conductivemusic.uk/";
target.appTheme.embedUrl = "./";
target.appTheme.shareUrl = "./";

writeFileSync(targetPath, JSON.stringify(target, null, 4) + "\n");
console.log(`prepared labelled preview with ${extensions.map(e => `${e.label} ${e.pin.commit}`).join(", ")}`);
