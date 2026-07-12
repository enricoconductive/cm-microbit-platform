import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteRoot = resolve(root, "built/packaged");
const previewRoot = resolve(siteRoot, "pxt-microbit");
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(previewRoot, "inkybit-preview-manifest.json"), "utf8"));
assert.equal(manifest.extension.commit, pins.extension.commit, "browser smoke extension revision does not match toolchain pin");
assert.equal(manifest.extension.repository, pins.extension.repository, "browser smoke extension repository does not match toolchain pin");
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
    await page.waitForSelector(".newprojectcard", { visible: true, timeout: 30000 });
    assert.equal(await page.title(), "Conductive Music MakeCode for micro:bit");
    assert.match(await page.$eval("#inkybit-development-preview", el => el.textContent), /Conductive Music MakeCode/i);

    const bundle = await page.evaluate(() => {
        const pkg = window.pxt?.appTarget?.bundledpkgs?.inkybit;
        return pkg && JSON.stringify(pkg);
    });
    assert(bundle?.includes("inkyimage_picker"), "browser target lacks the pinned selector consumer");
    const fieldBundle = await page.goto(`http://127.0.0.1:${port}/pxt-microbit/fieldeditors.js`);
    assert.equal(fieldBundle.status(), 200, "field editor bundle is not browser-loadable");
    assert((await fieldBundle.text()).includes('selector: "inkyimage"'), "field bundle lacks selector registration");

    await page.goto(`http://127.0.0.1:${port}/pxt-microbit/`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".newprojectcard", { visible: true, timeout: 30000 });
    await page.click(".newprojectcard");
    await page.waitForSelector("#projectNameInput", { visible: true });
    await page.type("#projectNameInput", "InkyBit preview smoke");
    await page.click('button[aria-label="Create"]');
    await page.waitForSelector('#blocks-addpackage\\.label', { visible: true, timeout: 30000 });
    await new Promise(resolveReady => setTimeout(resolveReady, 8000));
    const tourClose = await page.$("button.teaching-bubble-close");
    if (tourClose) await tourClose.click();

    await page.click('#blocks-addpackage\\.label');
    await page.waitForFunction(() => [...document.querySelectorAll(".common-extension-card-title")]
        .some(el => el.textContent.trim() === "inkybit"), { timeout: 30000 });
    await page.evaluate(() => {
        const title = [...document.querySelectorAll(".common-extension-card-title")]
            .find(el => el.textContent.trim() === "inkybit");
        title.parentElement.parentElement.querySelector("button").click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll(".blocklyTreeLabel")]
        .some(el => el.textContent.trim() === "Inky:Bit"), { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll(".blocklyTreeLabel")]
        .find(el => el.textContent.trim() === "Inky:Bit").click());
    await page.waitForSelector(".blocklyFlyout .inkybit_draw_full_screen_image", { visible: true });

    const flyoutBlock = await page.$eval(".blocklyFlyout .inkybit_draw_full_screen_image", el => el.getBoundingClientRect().toJSON());
    const onStart = await page.evaluate(() => {
        const block = [...document.querySelectorAll(".blocklyDraggable")].find(el =>
            !el.closest(".blocklyFlyout") && [...el.querySelectorAll(".blocklyText")]
                .some(text => text.textContent.replace(/\s+/g, " ").trim() === "on start"));
        return block.getBoundingClientRect().toJSON();
    });
    await page.mouse.move(flyoutBlock.x + 30, flyoutBlock.y + 20);
    await page.mouse.down();
    await page.mouse.move(650, 300, { steps: 20 });
    await new Promise(resolveSnap => setTimeout(resolveSnap, 500));
    await page.mouse.up();
    await page.waitForFunction(() => [...document.querySelectorAll(".inkybit_draw_full_screen_image")]
        .some(el => !el.closest(".blocklyFlyout") && el.getBoundingClientRect().width > 0));
    for (let attempt = 0; attempt < 3; attempt++) {
        const placed = await page.evaluate(() => {
            const block = [...document.querySelectorAll(".inkybit_draw_full_screen_image")]
                .find(el => !el.closest(".blocklyFlyout") && el.getBoundingClientRect().width > 0);
            return { disabled: block.classList.contains("blocklyDisabled"), rect: block.getBoundingClientRect().toJSON() };
        });
        if (!placed.disabled) break;
        await page.mouse.move(placed.rect.x + 12, placed.rect.y + 2);
        await page.mouse.down();
        await page.mouse.move(onStart.x + 25, onStart.y + 43, { steps: 20 });
        await new Promise(resolveSnap => setTimeout(resolveSnap, 500));
        await page.mouse.up();
    }
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".inkybit_draw_full_screen_image")]
        .find(el => !el.closest(".blocklyFlyout") && el.getBoundingClientRect().width > 0)
        .classList.contains("blocklyDisabled")), false, "image block did not connect to on start");
    const fieldPoint = await page.evaluate(() => {
        const block = [...document.querySelectorAll(".inkybit_draw_full_screen_image")]
            .find(el => !el.closest(".blocklyFlyout") && el.getBoundingClientRect().width > 0);
        const fieldText = block.querySelector(".blocklyEditableField text");
        const rect = fieldText.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(fieldPoint.x, fieldPoint.y);
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
        .some(el => el.offsetParent && el.textContent.trim() === "Done"), { timeout: 10000 });

    const canvasRect = await page.$eval("#ib-canvas-wrap canvas", el => el.getBoundingClientRect().toJSON());
    assert(canvasRect, "image editor canvas did not open");
    await page.mouse.click(canvasRect.x + canvasRect.width / 2, canvasRect.y + canvasRect.height / 2);
    await page.evaluate(() => [...document.querySelectorAll("button")]
        .find(el => el.offsetParent && el.textContent.trim() === "Done").click());
    await page.waitForFunction(() => ![...document.querySelectorAll("button")]
        .some(el => el.offsetParent && el.textContent.trim() === "Done"));
    const reopenedFieldPoint = await page.evaluate(() => {
        const block = [...document.querySelectorAll(".inkybit_draw_full_screen_image")]
            .find(el => !el.closest(".blocklyFlyout") && el.getBoundingClientRect().width > 0);
        const rect = block.querySelector(".blocklyEditableField text, .blocklyEditableField image")
            .getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(reopenedFieldPoint.x, reopenedFieldPoint.y);
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
        .some(el => el.offsetParent && el.textContent.trim() === "Done"), { timeout: 10000 });
    const centrePixel = await page.evaluate(() => {
        const canvas = document.querySelector("#ib-canvas-wrap canvas");
        return [...canvas.getContext("2d").getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data];
    });
    assert(centrePixel[0] < 32 && centrePixel[1] < 32 && centrePixel[2] < 32,
        "edited pixel was not committed by Done");
    await page.evaluate(() => [...document.querySelectorAll("button")]
        .find(el => el.offsetParent && el.textContent.trim() === "Cancel").click());
    console.log(`browser smoke: exact ${pins.extension.commit} consumer selected, image block edited, and Done committed`);
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
