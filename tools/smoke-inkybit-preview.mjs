import assert from "node:assert/strict";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteRoot = resolve(root, "built/packaged");
const previewRoot = resolve(siteRoot, "cm-microbit-platform");
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
    await page.goto(`http://127.0.0.1:${port}/cm-microbit-platform/`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".newprojectcard", { visible: true, timeout: 30000 });
    assert.equal(await page.title(), "Conductive Music MakeCode for micro:bit");
    assert.equal(await page.$("#inkybit-development-preview"), null, "bottom banner must be gone");
    const headerBrand = await page.evaluate(() => {
        const logo = document.querySelector(".header-logo img, .ui.item.logo.brand img");
        return {
            count: document.querySelectorAll(".header-logo img, .ui.item.logo.brand img").length,
            organizationLogoCount: document.querySelectorAll(".header-org-logo img").length,
            height: logo ? getComputedStyle(logo).height : undefined,
            homeUrl: window.pxt?.appTarget?.appTheme?.homeUrl
        };
    });
    assert.equal(headerBrand.count, 1, "header must contain one CM logo");
    assert.equal(headerBrand.organizationLogoCount, 0, "header must not render a second organisation logo");
    assert.equal(headerBrand.homeUrl, "https://conductivemusic.uk/", "Home must link to Conductive Music");
    assert(Math.abs(parseFloat(headerBrand.height) - 49.6) < 0.01, "header logo must use the larger brand size");

    const bundle = await page.evaluate(() => {
        const pkg = window.pxt?.appTarget?.bundledpkgs?.inkybit;
        return pkg && JSON.stringify(pkg);
    });
    assert(bundle?.includes("inkyimage_picker"), "browser target lacks the pinned selector consumer");
    const fieldBundle = await page.goto(`http://127.0.0.1:${port}/cm-microbit-platform/fieldeditors.js`);
    assert.equal(fieldBundle.status(), 200, "field editor bundle is not browser-loadable");
    assert((await fieldBundle.text()).includes('selector: "inkyimage"'), "field bundle lacks selector registration");

    await page.goto(`http://127.0.0.1:${port}/cm-microbit-platform/`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".newprojectcard", { visible: true, timeout: 30000 });
    await page.click(".newprojectcard");
    await page.waitForSelector("#projectNameInput", { visible: true });
    await page.type("#projectNameInput", "InkyBit preview smoke");
    await page.click('button[aria-label="Create"]');
    await new Promise(resolveReady => setTimeout(resolveReady, 8000));
    const tourClose = await page.$("button.teaching-bubble-close");
    if (tourClose) await tourClose.click();

    await page.waitForFunction(() => [...document.querySelectorAll(".blocklyTreeLabel")]
        .some(el => el.textContent.trim() === "Inky:Bit"), { timeout: 30000 });
    assert(await page.evaluate(() => [...document.querySelectorAll(".blocklyTreeLabel")]
        .some(el => el.textContent.trim() === "C Music")), "C Music category must be in the toolbox of a new project");
    const cmIcon = await page.evaluate(() => {
        const icon = document.querySelector('.blocklyTreeRow[data-ns="cm"] .blocklyTreeIcon.pxt-toolbox-icon');
        if (!icon) return undefined;
        const style = getComputedStyle(icon);
        return { image: style.backgroundImage, color: style.color };
    });
    assert(cmIcon, "C Music category row must carry the cm namespace");
    assert(/data:image\/svg\+xml/.test(cmIcon.image), "C Music category must show the CM waveform mark");
    assert.equal(cmIcon.color, "rgba(0, 0, 0, 0)", "C Music category must hide the fallback glyph behind the mark");
    await page.evaluate(() => [...document.querySelectorAll(".blocklyTreeLabel")]
        .find(el => el.textContent.trim() === "Inky:Bit").click());
    await page.waitForSelector(".blocklyFlyout .inkybit_draw_full_screen_image", { visible: true });
    const placeholder = await page.$eval(".blocklyFlyout .inkybit_draw_full_screen_image .blocklyEditableField", el => ({
        text: el.textContent.trim(),
        pill: !!el.querySelector("rect[rx='15']")
    }));
    assert.equal(placeholder.text, "", "Inky:Bit image field must not expose Blockly placeholder text");
    assert.equal(placeholder.pill, true, "Inky:Bit image field must render as a rounded neutral pill");

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
        const field = block.querySelector(".blocklyEditableField");
        const rect = field.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(fieldPoint.x, fieldPoint.y);
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
        .some(el => el.offsetParent && el.textContent.trim() === "Done"), { timeout: 10000 });
    const workspace = await page.evaluate(() => {
        const root = document.querySelector("#ib-editor-workspace");
        const namedHeader = document.querySelector("#root > .menubar, .menubar, header, [role='banner']");
        let header = namedHeader;
        if (!header || header.getBoundingClientRect().height === 0) {
            let candidate = document.elementFromPoint(window.innerWidth / 2, 10);
            while (candidate && candidate !== document.body) {
                const rect = candidate.getBoundingClientRect();
                if (rect.top <= 1 && rect.width >= window.innerWidth * 0.8 && rect.height >= 32 && rect.height <= 160) {
                    header = candidate;
                    break;
                }
                candidate = candidate.parentElement;
            }
        }
        const shell = root?.querySelector(".ib-editor-shell");
        const topBar = root?.querySelector(".ib-topbar");
        const toolRail = root?.querySelector(".ib-tool-rail");
        const canvas = root?.querySelector("#ib-canvas-wrap");
        const inspector = root?.querySelector(".ib-inspector");
        const bottomBar = root?.querySelector(".ib-bottombar");
        const rootRect = root?.getBoundingClientRect();
        const headerRect = header?.getBoundingClientRect();
        return {
            rootTop: rootRect?.top,
            rootHeight: rootRect?.height,
            headerBottom: headerRect?.bottom,
            shellWidth: shell?.getBoundingClientRect().width,
            viewportWidth: window.innerWidth,
            font: root ? getComputedStyle(root).fontFamily : "",
            background: root ? getComputedStyle(root).backgroundColor : "",
            canvasHeight: canvas?.getBoundingClientRect().height,
            topBarHeight: topBar?.getBoundingClientRect().height,
            topBarBackground: topBar ? getComputedStyle(topBar).backgroundColor : "",
            toolRailBackground: toolRail ? getComputedStyle(toolRail).backgroundColor : "",
            canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : "",
            inspectorBackground: inspector ? getComputedStyle(inspector).backgroundColor : "",
            bottomBarBackground: bottomBar ? getComputedStyle(bottomBar).backgroundColor : ""
        };
    });
    assert(workspace.headerBottom > 0, "MakeCode header was not found while editing");
    assert(Math.abs(workspace.rootTop - workspace.headerBottom) < 2, "editor did not start below the MakeCode header");
    assert(workspace.rootHeight > 500 && workspace.canvasHeight > 300, "editor did not occupy the workspace");
    assert(Math.abs(workspace.shellWidth - workspace.viewportWidth) < 2, "editor retained modal-width geometry");
    assert(!/rgba\(0,\s*0,\s*0,\s*0\.55\)/.test(workspace.background), "legacy dimmed modal backdrop remains");
    assert(workspace.font.length > 0, "editor did not inherit a platform font");
    assert(workspace.topBarHeight <= 54,
        `editor toolbar must remain compact beneath the MakeCode header (got ${workspace.topBarHeight}px)`);
    assert.equal(workspace.topBarBackground, "rgb(255, 255, 255)", "editor toolbar must be white");
    assert.equal(workspace.toolRailBackground, "rgb(255, 255, 255)", "editor tool rail must be white");
    assert.equal(workspace.canvasBackground, "rgb(41, 45, 51)", "editor canvas stage must be dark and neutral");
    assert.equal(workspace.inspectorBackground, "rgb(250, 250, 250)", "editor inspector must use restrained white chrome");
    assert.equal(workspace.bottomBarBackground, "rgb(242, 243, 244)", "editor footer must use neutral grey chrome");

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
        const rect = block.querySelector(".blocklyEditableField").getBoundingClientRect();
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
    await page.setViewport({ width: 640, height: 900 });
    await new Promise(resolveResize => setTimeout(resolveResize, 250));
    const compactLayout = await page.evaluate(() => {
        const workspace = document.querySelector("#ib-editor-workspace");
        const inspector = workspace?.querySelector(".ib-inspector")?.getBoundingClientRect();
        const canvas = workspace?.querySelector("#ib-canvas-wrap")?.getBoundingClientRect();
        return { inspectorWidth: inspector?.width, canvasHeight: canvas?.height };
    });
    assert(compactLayout.inspectorWidth > 500 && compactLayout.canvasHeight > 200,
        "compact layout did not retain a primary canvas and reachable inspector");
    await page.evaluate(() => [...document.querySelectorAll("button")]
        .find(el => el.offsetParent && el.textContent.trim() === "Cancel").click());
    console.log(`browser smoke: exact ${pins.extension.commit} consumer selected, image block edited, and Done committed`);
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
