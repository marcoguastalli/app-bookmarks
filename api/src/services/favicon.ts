export async function fetchFaviconUrl(pageUrl: string): Promise<string | null> {
  try {
    const hostname = new URL(pageUrl).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
    // Verify the URL is reachable with a HEAD request
    const res = await fetch(faviconUrl, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    if (res.ok) return faviconUrl;
    return null;
  } catch {
    return null;
  }
}
