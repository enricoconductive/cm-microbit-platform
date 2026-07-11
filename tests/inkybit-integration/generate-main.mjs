import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const bytes = new Uint8Array(7510);
bytes.set([0x49, 0x42, 0x49, 0x54, 1, 1, 250, 0, 120, 0]);
const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

const source = `// Generated Ticket 05 full-screen integration fixture.\n` +
    `inkybit.drawFullScreenImage(hex\`${hex}\`)\n` +
    `inkybit.drawRectangle(8, 8, 66, 22, inkybit.Color.White, true)\n` +
    `inkybit.drawText("ORDER", 12, 12, inkybit.Color.Black, inkybit.TextSize.Regular)\n` +
    `inkybit.show()\n`;

writeFileSync(resolve(root, "generated-main.ts"), source);
console.log(`generated pinned integration source (${Buffer.byteLength(source)} bytes)`);
