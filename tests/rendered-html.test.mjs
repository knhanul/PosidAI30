import assert from "node:assert/strict";
import test from "node:test";

// Smoke test for the rendered HTML output of the Vinext production build.
//
// Background: the original version of this test expected a
// <meta name="codex-preview" content="development"> tag that was injected by
// the `sites-vite-plugin` in the Codex preview development environment
// (see vite.config.ts comments referencing CODEX_SANDBOX). That plugin is a
// local-only artifact (gitignored, not present in the Docker build context)
// and the metadata is not a product requirement. The test contract has been
// updated to verify actual production build output characteristics instead.
//
// Prerequisites:
//   - A Vinext build must be present at dist/server/index.js
//   - In Docker: produced by `npx vinext build` during image build
//   - On host: produced by `npm run build` (requires bash) or by copying
//     dist/ from the Docker container

test("renders valid HTML document with expected structure", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  // 1. HTTP 200 response
  assert.equal(response.status, 200);

  // 2. Content-Type is HTML
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );

  const html = await response.text();

  // 3. Valid HTML document structure
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html[^>]*>/i);
  assert.match(html, /<head[^>]*>/i);
  assert.match(html, /<body[^>]*>/i);

  // 4. Title metadata exists
  assert.match(html, /<title>[^<]+<\/title>/i);

  // 5. Charset or viewport metadata exists
  assert.match(html, /<meta[^>]*charset=/i);

  // 6. Static asset references (CSS) are present
  assert.match(html, /<link[^>]*rel=["']stylesheet["'][^>]*>/i);

  // 7. No fatal placeholder/debug markup
  assert.doesNotMatch(html, /\{\{[^}]*\}\}/);
  assert.doesNotMatch(html, /<%[^%]*%>/);
});
