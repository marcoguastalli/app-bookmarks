const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_eid",
  "ref",
  "_ga",
  "igshid",
]);

export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());

    // Lowercase scheme and host (URL constructor already does this)
    // Remove default ports
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    // Strip tracking params
    const keys = [...parsed.searchParams.keys()];
    for (const key of keys) {
      if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }

    // Sort remaining params for determinism
    parsed.searchParams.sort();

    // Remove trailing slash except root
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return raw.trim().toLowerCase();
  }
}
