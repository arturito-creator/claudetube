import { chromium } from "playwright";

/**
 * Render `entryUrl` in headless Chromium and return a JPEG screenshot of the
 * viewport after the `load` event plus a short settle. Used for bundle
 * thumbnails on upload.
 */
export async function captureThumbnail(
  entryUrl: string,
  { settleMs = 1200, width = 1280, height = 720 } = {},
): Promise<Buffer> {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({
      viewport: { width, height },
      // Pretend to be a normal desktop; some shaders check prefers-reduced-motion.
      reducedMotion: "no-preference",
    });
    const page = await ctx.newPage();
    await page.goto(entryUrl, { waitUntil: "load", timeout: 20_000 });
    await page.waitForTimeout(settleMs);
    return await page.screenshot({
      type: "jpeg",
      quality: 82,
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}
