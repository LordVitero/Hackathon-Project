import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const api = "http://127.0.0.1:4011";
async function fixture(width = 1200, height = 800, orientation = 1) {
  // Synthetic image for coordinate checks, never presented as a model-tested Lenny scene.
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9e1c7"/><rect x="${width*.4}" y="${height*.4}" width="${width*.2}" height="${height*.2}" fill="#537d3d"/><text x="${width*.08}" y="${height*.15}" font-size="${Math.max(width,height)*.045}" fill="#203c2d">Coordinate test image</text><path d="M0 ${height/2}H${width}M${width/2} 0V${height}" stroke="#849671" stroke-width="3"/></svg>`;
  let image = sharp(Buffer.from(svg)).jpeg();
  if (orientation !== 1) image = image.withMetadata({ orientation });
  return { name: "scene.jpg", mimeType: "image/jpeg", buffer: await image.toBuffer() };
}
async function reference(page: Page) { await page.getByLabel("Reference photo upload", { exact: true }).setInputFiles(await fixture(250, 250)); await expect(page.getByRole("button", { name: "Take a photo", exact: true })).toBeEnabled(); }
async function scene(page: Page, w = 1200, h = 800, orientation = 1) { await page.getByLabel("Scene photo upload", { exact: true }).setInputFiles(await fixture(w, h, orientation)); await expect(page.getByRole("heading", { name: "Show us where Lenny is." })).toBeVisible(); }
async function mark(page: Page) { await page.getByRole("button", { name: "Start with a centered box" }).click(); }
async function lock(page: Page) { await page.getByRole("button", { name: "Lock AI guess", exact: true }).click(); await expect(page.getByRole("button", { name: "Reveal the guess" })).toBeVisible(); }
async function reveal(page: Page) { await page.getByRole("button", { name: "Reveal the guess" }).click(); await expect(page.getByRole("button", { name: "Hide Lenny again" })).toBeVisible(); }
async function aligned(page: Page, testId: string, box: number[]) {
  const image = await page.locator(".round .photo-stage > img").boundingBox();
  const overlay = await page.locator(".round").getByTestId(testId).boundingBox();
  expect(image).not.toBeNull(); expect(overlay).not.toBeNull();
  expect(Math.abs(overlay!.x - (image!.x + image!.width * box[0]))).toBeLessThan(2);
  expect(Math.abs(overlay!.y - (image!.y + image!.height * box[1]))).toBeLessThan(2);
  expect(Math.abs(overlay!.width - image!.width * (box[2] - box[0]))).toBeLessThan(2);
  expect(Math.abs(overlay!.height - image!.height * (box[3] - box[1]))).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
test.beforeEach(async ({ page, request }) => { await request.post(api + "/test/reset", { data: {} }); await page.goto("/"); await expect(page.locator(".app-shell")).toHaveAttribute("data-ready", "true"); });

test("portrait, landscape, panorama and EXIF rotation stay aligned through mobile resize", async ({ page, request }) => {
  await reference(page);
  for (const [w, h, orientation] of [[1200, 800, 1], [600, 1000, 1], [1800, 450, 1], [3200, 1200, 1], [1000, 600, 6]]) {
    await scene(page, w, h, orientation); await mark(page); await aligned(page, "actual-box", [.4, .4, .6, .6]);
    await lock(page); await reveal(page); await aligned(page, "prediction-box", [.4, .4, .6, .6]);
    await page.setViewportSize({ width: 390, height: 844 }); await aligned(page, "prediction-box", [.4, .4, .6, .6]);
    await page.setViewportSize({ width: 320, height: 700 }); await aligned(page, "actual-box", [.4, .4, .6, .6]);
    await page.getByRole("button", { name: "Hide Lenny again" }).click();
    await expect(page.locator(".round")).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  const events = await (await request.get(api + "/test/events")).json();
  expect(events.filter((e: { action: string }) => e.action === "create").at(-1)).toMatchObject({ width: 600, height: 1000, orientation: 1, sceneType: "image/jpeg", referenceType: "image/jpeg" });
  expect(events.filter((e: { action: string }) => e.action === "create").at(-2)).toMatchObject({ width: 2400, height: 900 });
  expect(events.filter((e: { action: string }) => e.action === "seek").every((e: { bodyBytes: number }) => e.bodyBytes === 0)).toBe(true);
  expect(await page.locator(".history-grid li").count()).toBe(5);
});

test("pointer and keyboard adjustment send the same normalized box; reveal and review are accessible", async ({ page, request }) => {
  await reference(page); await scene(page);
  const bounds = (await page.locator(".round .photo-stage > img").boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .3);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .8, { steps: 5 }); await page.mouse.up();
  await aligned(page, "actual-box", [.2, .3, .7, .8]);
  await page.getByRole("slider", { name: "Left edge" }).focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "Left edge" })).toHaveValue("201");
  const before = await new AxeBuilder({ page }).analyze(); expect(before.violations).toEqual([]);
  await lock(page); await reveal(page);
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByRole("status").last()).toContainText("No feedback was sent");
  await page.getByRole("button", { name: "Flag for review" }).click();
  await page.getByRole("slider", { name: "Left edge" }).fill("250");
  await page.getByRole("button", { name: "Keep review note" }).click();
  await expect(page.getByRole("status").last()).toContainText("locked score is unchanged");
  await page.getByRole("button", { name: "Flag for review" }).click();
  await expect(page.getByRole("slider", { name: "Left edge" })).toHaveValue("250");
  await page.getByRole("button", { name: "Cancel review" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const events = await (await request.get(api + "/test/events")).json();
  const actual = events.find((e: { action: string }) => e.action === "create").actual;
  expect(actual[0]).toBeCloseTo(.201, 3); expect(actual[1]).toBeCloseTo(.3, 2);
});

test("denied camera permission requests only after a click and leaves a working upload", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, "cameraCalls", 0);
    navigator.mediaDevices.getUserMedia = async () => { Reflect.set(window, "cameraCalls", Reflect.get(window, "cameraCalls") + 1); throw new DOMException("denied", "NotAllowedError"); };
  });
  await page.reload(); await reference(page);
  expect(await page.evaluate(() => Reflect.get(window, "cameraCalls"))).toBe(0);
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("permission was denied");
  expect(await page.evaluate(() => Reflect.get(window, "cameraCalls"))).toBe(1);
  await scene(page); await mark(page); await lock(page); await reveal(page);
});

test("repeated capture, cancel, upload alternative and page hiding stop camera tracks", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Reflect.set(window, "cameraTracks", []);
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); Reflect.get(window, "cameraTracks").push(...stream.getTracks()); return stream; };
  });
  await page.reload(); await reference(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Take a photo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Capture photo" })).toBeEnabled();
    await page.getByRole("button", { name: "Capture photo" }).dblclick();
    await expect(page.locator(".round .photo-stage > img")).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "cameraTracks").every((t: MediaStreamTrack) => t.readyState === "ended"))).toBe(true);
    await scene(page); await mark(page); await lock(page); await reveal(page); await page.getByRole("button", { name: "Hide Lenny again" }).click();
  }
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capture photo" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel camera" }).click();
  expect(await page.evaluate(() => Reflect.get(window, "cameraTracks").every((t: MediaStreamTrack) => t.readyState === "ended"))).toBe(true);
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capture photo" })).toBeEnabled();
  const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "Upload instead" }).click(); await (await chooser).setFiles(await fixture());
  expect(await page.evaluate(() => Reflect.get(window, "cameraTracks").every((t: MediaStreamTrack) => t.readyState === "ended"))).toBe(true);
  await mark(page); await lock(page); await reveal(page); await page.getByRole("button", { name: "Hide Lenny again" }).click();
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capture photo" })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByRole("button", { name: "Upload a scene" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "cameraTracks").every((t: MediaStreamTrack) => t.readyState === "ended"))).toBe(true);
});

test("slow and cancelled seeks, replacement, and retries preserve locked rounds", async ({ page, request }) => {
  await request.post(api + "/test/reset", { data: { seekDelay: 700 } });
  await reference(page); await scene(page); await mark(page);
  await page.getByRole("button", { name: "Lock AI guess", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText("Waiting for the locked");
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.getByRole("button", { name: "Retry this round" }).click();
  await expect(page.getByRole("button", { name: "Reveal the guess" })).toBeVisible();
  await reveal(page);
  let events = await (await request.get(api + "/test/events")).json();
  expect(events.filter((e: { action: string }) => e.action === "create")).toHaveLength(1);
  expect(events.filter((e: { action: string }) => e.action === "inference")).toHaveLength(1);
  await page.getByRole("button", { name: "Hide Lenny again" }).click();
  await scene(page); await mark(page); await page.getByRole("button", { name: "Lock AI guess", exact: true }).click();
  await scene(page, 600, 900);
  await page.waitForTimeout(900);
  await expect(page.getByRole("heading", { name: "Show us where Lenny is." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal the guess" })).toHaveCount(0);
  expect(await page.locator(".history-grid li").count()).toBe(1);
});

test("not found awards a point; inference and reveal failures remain visible with safe retries", async ({ page, request }) => {
  await request.post(api + "/test/reset", { data: { failSeekOnce: true, failRevealOnce: true, notFound: true } });
  await reference(page); await scene(page); await mark(page);
  await page.getByRole("button", { name: "Lock AI guess", exact: true }).click();
  await expect(page.locator(".error-message")).toContainText("HTTP 503"); await expect(page.locator(".history-grid li")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry this round" }).click(); await expect(page.getByRole("button", { name: "Reveal the guess" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal the guess" }).click(); await expect(page.locator(".error-message")).toContainText("HTTP 503");
  await reveal(page); await expect(page.locator(".round-controls")).toContainText("valid “not found”");
  await expect(page.locator(".header-note")).toContainText("You 1 / AI 0");
  await expect(page.locator(".round").getByTestId("prediction-box")).toHaveCount(0);
});

test("demo round is labeled, never uploads, and keeps scores separate; save QA screenshots", async ({ page, request }) => {
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/desktop-start.png", fullPage: true });
  await page.getByLabel("Try a simulated round").check();
  await reference(page); await scene(page); await mark(page);
  await page.getByRole("button", { name: "Lock demo guess" }).click(); await expect(page.getByRole("button", { name: "Reveal the guess" })).toBeVisible(); await reveal(page);
  await expect(page.locator(".mode-note")).toContainText("simulated"); await expect(page.locator(".header-note")).toContainText("Demo");
  expect(await (await request.get(api + "/test/events")).json()).toEqual([]);
  await page.screenshot({ path: "artifacts/desktop-reveal.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile-reveal.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Hide Lenny again" }).click();
  await page.getByLabel("Try a simulated round").uncheck(); await expect(page.locator(".header-note")).toContainText("Session · You 0 / AI 0");
});
