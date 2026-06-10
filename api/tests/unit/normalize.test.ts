import { describe, it, expect } from "bun:test";
import { normalizeUrl } from "../../src/utils/normalize.js";

describe("normalizeUrl", () => {
  it("lowercases scheme and host", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/path")).toBe("https://example.com/path");
  });

  it("removes default port 80 for http", () => {
    expect(normalizeUrl("http://example.com:80/path")).toBe("http://example.com/path");
  });

  it("removes default port 443 for https", () => {
    expect(normalizeUrl("https://example.com:443/path")).toBe("https://example.com/path");
  });

  it("keeps non-default ports", () => {
    expect(normalizeUrl("http://example.com:8080/path")).toBe("http://example.com:8080/path");
  });

  it("removes trailing slash except root", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("strips utm_* tracking params", () => {
    expect(normalizeUrl("https://example.com/page?utm_source=google&utm_medium=cpc")).toBe(
      "https://example.com/page"
    );
  });

  it("strips fbclid", () => {
    expect(normalizeUrl("https://example.com/page?fbclid=abc123")).toBe(
      "https://example.com/page"
    );
  });

  it("preserves meaningful query params", () => {
    const url = normalizeUrl("https://example.com/search?q=hello&page=2");
    expect(url).toContain("q=hello");
    expect(url).toContain("page=2");
  });

  it("removes utm_* but keeps other params", () => {
    const url = normalizeUrl("https://example.com/search?q=hello&utm_source=newsletter");
    expect(url).toContain("q=hello");
    expect(url).not.toContain("utm_source");
  });

  it("sorts remaining query params for determinism", () => {
    const a = normalizeUrl("https://example.com/?z=1&a=2");
    const b = normalizeUrl("https://example.com/?a=2&z=1");
    expect(a).toBe(b);
  });

  it("handles malformed URL gracefully", () => {
    const result = normalizeUrl("not-a-url");
    expect(result).toBe("not-a-url");
  });

  it("handles empty string", () => {
    const result = normalizeUrl("");
    expect(result).toBe("");
  });

  it("handles URL with hash", () => {
    const result = normalizeUrl("https://example.com/page#section");
    expect(result).toBe("https://example.com/page#section");
  });
});
