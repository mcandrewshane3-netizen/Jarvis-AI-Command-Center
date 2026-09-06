import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("JARVIS iPad PWA", () => {
  it("has installable standalone metadata and branded icons", async () => {
    const manifestPath = resolve(import.meta.dirname, "../../../../jarvis/public/manifest.webmanifest");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      name: "JARVIS AI Command Center",
      short_name: "JARVIS",
      start_url: "./",
      scope: "./",
      display: "standalone",
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]));
  });

  it("never caches authenticated API responses in the service worker", async () => {
    const workerPath = resolve(import.meta.dirname, "../../../../jarvis/public/sw.js");
    const worker = await readFile(workerPath, "utf8");
    expect(worker).toContain('url.pathname.includes("/api/")');
  });
});