import { describe, expect, it } from "vitest";

import { GET as blueprintGet, POST as blueprintPost } from "@/app/api/blueprint/route";
import { POST as buildPost } from "@/app/api/build/route";
import { nightMarketExhibit } from "@/lib/sample-exhibits";

describe("pipeline API routes", () => {
  it("reports live-analysis capability without exposing configuration", async () => {
    const response = await blueprintGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true, liveAnalysisAvailable: expect.any(Boolean) });
  });

  it("returns a no-store deterministic blueprint envelope", async () => {
    const response = await blueprintPost(
      new Request("http://localhost/api/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleSlug: nightMarketExhibit.slug, live: false }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ ok: true, mode: "demo" });
    expect(body.manifest.slug).toBe(nightMarketExhibit.slug);
  });

  it("rejects malformed and oversized blueprint packets", async () => {
    const malformed = await blueprintPost(
      new Request("http://localhost/api/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    const oversized = await blueprintPost(
      new Request("http://localhost/api/blueprint", {
        method: "POST",
        headers: { "content-length": "25000001", "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it("rejects CORS-simple and cross-origin mutation requests before parsing", async () => {
    const simple = await blueprintPost(
      new Request("http://localhost/api/blueprint", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );
    const crossOrigin = await buildPost(
      new Request("http://localhost/api/build", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        body: "{}",
      }),
    );

    expect(simple.status).toBe(415);
    expect(crossOrigin.status).toBe(403);
    expect(simple.headers.get("cache-control")).toBe("no-store");
    expect(crossOrigin.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts a same-origin browser request when a framework normalizes its request URL", async () => {
    const response = await blueprintPost(
      new Request("http://localhost/api/blueprint", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ sampleSlug: nightMarketExhibit.slug, live: false }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects a manifest with a dangling source reference", async () => {
    const broken = structuredClone(nightMarketExhibit);
    broken.claims[0].sourceIds = ["missing-source"];
    const response = await buildPost(
      new Request("http://localhost/api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest: broken, live: false }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.issues.some((issue: { message: string }) => issue.message.includes("missing source"))).toBe(true);
  });
});
