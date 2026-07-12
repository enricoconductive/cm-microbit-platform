import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const extensionDir = resolve(root, process.env.INKYBIT_EXTENSION_DIR || "libs/inkybit");
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const targetPath = resolve(root, "pxtarget.json");
const target = JSON.parse(readFileSync(targetPath, "utf8"));

const extensionHead = execFileSync("git", ["-C", extensionDir, "rev-parse", "HEAD"], {
    encoding: "utf8"
}).trim();
assert.equal(extensionHead, pins.extension.commit, "checked-out extension does not match toolchain pin");

// Bundled target packages resolve sibling core packages by file path. This is
// the only preview-specific rewrite; all extension source files remain at the
// verified commit above.
const extensionConfigPath = resolve(extensionDir, "pxt.json");
const extensionConfig = JSON.parse(readFileSync(extensionConfigPath, "utf8"));
extensionConfig.dependencies.core = "file:../core";
writeFileSync(extensionConfigPath, JSON.stringify(extensionConfig, null, 4) + "\n");

const relativeExtension = "libs/inkybit";
const basePackages = [...target.bundleddirs];
assert(!basePackages.includes(relativeExtension), "preview package is already configured");
target.bundleddirs.push(relativeExtension);
target.staticpkgdirs = {
    base: basePackages,
    extensions: [relativeExtension]
};
target.name = "Conductive Music MakeCode";
target.title = "Conductive Music MakeCode for micro:bit";
target.description = "A Blocks / JavaScript code editor for the micro:bit powered by Conductive Music.";
target.appTheme.organization = "Conductive Music";
target.appTheme.homeUrl = "./";
target.appTheme.embedUrl = "./";
target.appTheme.shareUrl = "./";

writeFileSync(targetPath, JSON.stringify(target, null, 4) + "\n");
console.log(`prepared labelled preview with pxt-inkybit ${extensionHead}`);
