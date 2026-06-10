import { describe, it, expect } from "bun:test";

// Test the HTML escaping logic inline (no DB needed)
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

describe("export HTML escaping", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Bread & Butter")).toBe("Bread &amp; Butter");
  });

  it("escapes < and >", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's fine")).toBe("it&#x27;s fine");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("prevents XSS in bookmark title", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<img");
    expect(escaped).not.toContain("onerror");
  });
});
