import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteRoot = resolve(root, "built/packaged");
const types = new Map([
    [".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"],
    [".json", "application/json"], [".png", "image/png"], [".svg", "image/svg+xml"]
]);

const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = normalize(join(siteRoot, pathname));
    if (!file.startsWith(siteRoot)) {
        response.writeHead(403).end();
        return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
        response.writeHead(404).end();
        return;
    }
    response.setHeader("Content-Type", types.get(extname(file)) || "application/octet-stream");
    createReadStream(file).pipe(response);
});

await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`http://127.0.0.1:${port}/pxt-microbit/`, { waitUntil: "networkidle2" });
    assert.equal(await page.title(), "DEVELOPMENT PREVIEW - Inky:Bit Image Editor");
    assert.match(await page.$eval("#inkybit-development-preview", el => el.textContent), /not public MakeCode/i);

    const bundle = await page.evaluate(() => {
        const pkg = window.pxt?.appTarget?.bundledpkgs?.inkybit;
        return pkg && JSON.stringify(pkg);
    });
    assert(bundle?.includes("inkyimage_picker"), "browser target lacks the pinned selector consumer");
    const fieldBundle = await page.goto(`http://127.0.0.1:${port}/pxt-microbit/fieldeditors.js`);
    assert.equal(fieldBundle.status(), 200, "field editor bundle is not browser-loadable");
    assert((await fieldBundle.text()).includes('selector: "inkyimage"'), "field bundle lacks selector registration");
    console.log("browser smoke: labelled editor booted with pinned consumer and inkyimage field bundle");
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
