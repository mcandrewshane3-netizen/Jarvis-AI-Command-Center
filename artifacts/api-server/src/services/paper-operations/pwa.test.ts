import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("JARVIS iPad PWA", () => {
  it("has installable standalone metadata, direct core launch, and branded icons", async () => {
    const manifestPath = resolve(import.meta.dirname, "../../../../jarvis/public/manifest.webmanifest");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      name: "JARVIS AI Command Center",
      short_name: "JARVIS",
      start_url: "./jarvis",
      scope: "./",
      display: "standalone",
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]));
  });

  it("never caches authenticated API or auth-runtime responses in the service worker", async () => {
    const workerPath = resolve(import.meta.dirname, "../../../../jarvis/public/sw.js");
    const worker = await readFile(workerPath, "utf8");
    expect(worker).toContain('url.pathname.includes("/api/")');
    expect(worker).toContain('url.pathname.includes("/__clerk")');
    expect(worker).toContain('url.pathname.startsWith("/sign-in")');
    expect(worker).toContain('url.pathname.startsWith("/sign-up")');
  });

  it("preloads a secure offline boot state instead of hanging on auth initialization", async () => {
    const workerPath = resolve(import.meta.dirname, "../../../../jarvis/public/sw.js");
    const worker = await readFile(workerPath, "utf8");
    expect(worker).toContain('"./offline-boot.js"');

    const indexPath = resolve(import.meta.dirname, "../../../../jarvis/index.html");
    const index = await readFile(indexPath, "utf8");
    expect(index).toContain('src="./offline-boot.js"');

    const offlineBootPath = resolve(import.meta.dirname, "../../../../jarvis/public/offline-boot.js");
    const offlineBoot = await readFile(offlineBootPath, "utf8");
    expect(offlineBoot).toContain("navigator.onLine");
    expect(offlineBoot).toContain("jarvis-offline-boot");
    expect(offlineBoot).toContain("will not expose cached private conversations");
  });
});
