/**
 * Slug derivation (SPEC §11). The slug is ALWAYS derived from the name — never
 * hand-edited. Ported verbatim from the reference.
 */

/**
 * Fold accents to ASCII (NFKD → strip combining marks), lowercase, collapse
 * every run of non-alphanumerics to a single "-", and trim "-" from both ends.
 */
export function slugify(s: unknown): string {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slug used for filenames etc.; falls back to "scheme" when empty. */
export function effectiveSlug(name: unknown): string {
  return slugify(name) || "scheme";
}
