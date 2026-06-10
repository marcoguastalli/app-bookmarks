import { describe, it, expect } from "bun:test";
import { parseNetscapeHtml } from "../../src/services/import.js";

const SAMPLE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Work</H3>
    <DL><p>
        <DT><A HREF="https://github.com">GitHub</A>
        <DT><A HREF="https://linear.app">Linear</A>
        <DT><H3>Dev Tools</H3>
        <DL><p>
            <DT><A HREF="https://bun.sh">Bun</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://news.ycombinator.com">Hacker News</A>
</DL><p>`;

describe("parseNetscapeHtml", () => {
  it("parses top-level bookmarks", () => {
    const items = parseNetscapeHtml(SAMPLE_HTML);
    const hn = items.find((i) => i.type === "bookmark" && i.url === "https://news.ycombinator.com");
    expect(hn).toBeDefined();
  });

  it("parses top-level folders", () => {
    const items = parseNetscapeHtml(SAMPLE_HTML);
    const work = items.find((i) => i.type === "folder" && i.name === "Work");
    expect(work).toBeDefined();
  });

  it("parses nested bookmarks", () => {
    const items = parseNetscapeHtml(SAMPLE_HTML);
    const work = items.find((i) => i.type === "folder" && i.name === "Work") as any;
    expect(work).toBeDefined();
    const gh = work.children.find((i: any) => i.type === "bookmark" && i.url === "https://github.com");
    expect(gh).toBeDefined();
  });

  it("parses nested folders", () => {
    const items = parseNetscapeHtml(SAMPLE_HTML);
    const work = items.find((i) => i.type === "folder" && i.name === "Work") as any;
    const devTools = work.children.find((i: any) => i.type === "folder" && i.name === "Dev Tools");
    expect(devTools).toBeDefined();
  });

  it("parses deeply nested bookmarks", () => {
    const items = parseNetscapeHtml(SAMPLE_HTML);
    const work = items.find((i) => i.type === "folder" && i.name === "Work") as any;
    const devTools = work.children.find((i: any) => i.type === "folder") as any;
    const bun = devTools.children.find((i: any) => i.type === "bookmark" && i.url === "https://bun.sh");
    expect(bun).toBeDefined();
  });

  it("returns empty array for empty HTML", () => {
    const items = parseNetscapeHtml("");
    expect(items).toEqual([]);
  });

  it("handles malformed HTML gracefully", () => {
    const html = "<DL><p><DT><A HREF='http://example.com'>Example</DL>";
    const items = parseNetscapeHtml(html);
    expect(Array.isArray(items)).toBe(true);
  });

  it("uses URL as title fallback when title is missing", () => {
    const html = `<DL><p><DT><A HREF="https://example.com"></A></DL>`;
    const items = parseNetscapeHtml(html);
    const bm = items.find((i) => i.type === "bookmark") as any;
    expect(bm?.title).toBe("https://example.com");
  });

  it("skips bookmarks with no href", () => {
    const html = `<DL><p><DT><A>No URL</A><DT><A HREF="https://ok.com">OK</A></DL>`;
    const items = parseNetscapeHtml(html);
    expect(items.some((i) => i.type === "bookmark" && (i as any).url === "")).toBe(false);
  });
});
