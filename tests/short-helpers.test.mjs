import assert from "node:assert/strict";
import test from "node:test";

// Import the helpers under test. These are pure functions with no React/DOM deps.
import {
  buildShortPostPayload,
  shortSummary,
  toPublicPost,
} from "../app/api-client.ts";
import {
  shortCategoryLabels,
  shortCategoryLabel,
  isArticleCategory,
} from "../app/content.ts";

// ---------------------------------------------------------------------------
// 1. Type / Mapping
// ---------------------------------------------------------------------------

test("shortCategoryLabels maps all five short categories", () => {
  assert.equal(shortCategoryLabels.tip, "TIP");
  assert.equal(shortCategoryLabels.discovery, "발견");
  assert.equal(shortCategoryLabels.use_case, "활용");
  assert.equal(shortCategoryLabels.memo, "메모");
  assert.equal(shortCategoryLabels.link, "링크");
  assert.equal(Object.keys(shortCategoryLabels).length, 5);
});

test("shortCategoryLabel returns label or fallback", () => {
  assert.equal(shortCategoryLabel("tip"), "TIP");
  assert.equal(shortCategoryLabel("discovery"), "발견");
  assert.equal(shortCategoryLabel(null), "짧게보기");
  assert.equal(shortCategoryLabel(undefined), "짧게보기");
});

test("isArticleCategory excludes short", () => {
  assert.equal(isArticleCategory("news"), true);
  assert.equal(isArticleCategory("learn"), true);
  assert.equal(isArticleCategory("use"), true);
  assert.equal(isArticleCategory("together"), true);
  assert.equal(isArticleCategory("short"), false);
});

test("toPublicPost maps short_category and external_url", () => {
  const api = {
    id: "abc", slug: "test-short", category: "short",
    short_category: "tip", external_url: "https://example.com/post",
    title: "테스트", summary: "요약", body_markdown: "본문",
    content_format: "markdown", content_density: "compact",
    topics: ["AI"], key_points: [], status: "published",
    is_featured: false, thumbnail_type: "preset", thumbnail_url: null,
    service_status: null, service_audience: null, service_url: null,
    author_name: "테스터", created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z", published_at: "2026-09-10T00:00:00Z",
    show_on_home: true, owned_by_current_user: false,
    like_count: 3, comment_count: 1,
  };
  const post = toPublicPost(api);
  assert.equal(post.category, "short");
  assert.equal(post.shortCategory, "tip");
  assert.equal(post.externalUrl, "https://example.com/post");
  assert.equal(post.contentDensity, "compact");
  assert.equal(post.featured, false);
});

// ---------------------------------------------------------------------------
// 2. Payload (buildShortPostPayload)
// ---------------------------------------------------------------------------

test("buildShortPostPayload sets correct short invariants", () => {
  const payload = buildShortPostPayload({
    title: "짧은 팁", body: "이것은 짧은 팁입니다.",
    shortCategory: "tip", externalUrl: "https://example.com",
    topics: ["AI/팁"], showOnHome: true,
  });
  assert.equal(payload.category, "short");
  assert.equal(payload.short_category, "tip");
  assert.equal(payload.external_url, "https://example.com");
  assert.equal(payload.content_format, "markdown");
  assert.equal(payload.content_density, "compact");
  assert.equal(payload.is_featured, false);
  assert.deepEqual(payload.key_points, []);
  assert.equal(payload.thumbnail_type, "preset");
  assert.equal(payload.service_status, null);
  assert.equal(payload.service_audience, null);
  assert.equal(payload.service_url, null);
  assert.deepEqual(payload.topics, ["AI/팁"]);
  assert.equal(payload.show_on_home, true);
});

test("buildShortPostPayload generates summary from body", () => {
  const body = "첫 번째 줄입니다. 두 번째 문장입니다.";
  const payload = buildShortPostPayload({
    title: "테스트", body,
    shortCategory: "memo", topics: [], showOnHome: false,
  });
  assert.equal(payload.summary, shortSummary(body));
  assert.ok(payload.summary.length <= 400);
});

test("buildShortPostPayload trims empty external_url to null", () => {
  const payload = buildShortPostPayload({
    title: "테스트", body: "본문",
    shortCategory: "link", externalUrl: "   ",
    topics: [], showOnHome: false,
  });
  assert.equal(payload.external_url, null);
});

test("shortSummary collapses whitespace and truncates", () => {
  assert.equal(shortSummary("  hello   world  "), "hello world");
  const long = "a".repeat(500);
  assert.equal(shortSummary(long).length, 400);
});

// ---------------------------------------------------------------------------
// 3. Search query URL construction
// ---------------------------------------------------------------------------

function mockFetch() {
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function (url, init) {
    urls.push(typeof url === "string" ? url : url.toString());
    return Promise.resolve(new Response(
      JSON.stringify({ items: [], page: 1, has_more: false }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
  };
  return { urls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("listPublishedPostPage builds correct search query URL", async () => {
  const mock = mockFetch();
  try {
    const { listPublishedPostPage } = await import("../app/api-client.ts");
    await listPublishedPostPage({ query: "ChatGPT", page: 1, pageSize: 20 });
    await listPublishedPostPage({ query: "#AI", page: 1, pageSize: 20 });
    await listPublishedPostPage({ query: "#AI/보안", page: 2, pageSize: 20 });
  } finally {
    mock.restore();
  }

  assert.ok(mock.urls[0].includes("q=ChatGPT"));
  assert.ok(mock.urls[0].includes("page=1"));
  assert.ok(mock.urls[0].includes("page_size=20"));
  // # must be URL-encoded as %23
  assert.ok(mock.urls[1].includes("q=%23AI") || mock.urls[1].includes("q=" + encodeURIComponent("#AI")));
  assert.ok(mock.urls[2].includes("page=2"));
});

test("search reset returns to page 1", async () => {
  const mock = mockFetch();
  try {
    const { listPublishedPostPage } = await import("../app/api-client.ts");
    await listPublishedPostPage({ query: "test", page: 2, pageSize: 20 });
    await listPublishedPostPage({ query: "test", page: 1, pageSize: 20 });
  } finally {
    mock.restore();
  }

  assert.ok(mock.urls[0].includes("page=2"));
  assert.ok(mock.urls[1].includes("page=1"));
});

// ---------------------------------------------------------------------------
// 4. Filter query construction
// ---------------------------------------------------------------------------

test("listPublishedPostPage builds correct short filter URL", async () => {
  const mock = mockFetch();
  try {
    const { listPublishedPostPage } = await import("../app/api-client.ts");
    await listPublishedPostPage({ category: "short", shortCategory: "tip", page: 1, pageSize: 20 });
    await listPublishedPostPage({ category: "short", shortCategory: "discovery", page: 1, pageSize: 20 });
  } finally {
    mock.restore();
  }

  assert.ok(mock.urls[0].includes("category=short"));
  assert.ok(mock.urls[0].includes("short_category=tip"));
  assert.ok(mock.urls[1].includes("short_category=discovery"));
});

test("listPublishedPostPage combines filter and search", async () => {
  const mock = mockFetch();
  try {
    const { listPublishedPostPage } = await import("../app/api-client.ts");
    await listPublishedPostPage({ category: "short", shortCategory: "use_case", query: "프롬프트", page: 1, pageSize: 20 });
  } finally {
    mock.restore();
  }

  assert.ok(mock.urls[0].includes("category=short"));
  assert.ok(mock.urls[0].includes("short_category=use_case"));
  assert.ok(mock.urls[0].includes("q=" + encodeURIComponent("프롬프트")));
});

test("listPublishedPostPage homeOnly adds home=true", async () => {
  const mock = mockFetch();
  try {
    const { listPublishedPostPage } = await import("../app/api-client.ts");
    await listPublishedPostPage({ category: "short", homeOnly: true, pageSize: 5 });
  } finally {
    mock.restore();
  }

  assert.ok(mock.urls[0].includes("home=true"));
  assert.ok(mock.urls[0].includes("page_size=5"));
});
