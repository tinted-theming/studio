/**
 * GitHub URL normalization for scheme import. Only GitHub file URLs are
 * accepted (an allowlist, so shared `#url=` links can't make a viewer's browser
 * hit arbitrary hosts). Blob/raw page links become raw.githubusercontent.com
 * URLs, which serve the file with permissive CORS.
 */

export type GithubUrlResult = { ok: true; url: string } | { ok: false; error: string };

const ACCEPTED =
  "Use a GitHub file link (github.com/<owner>/<repo>/blob/<branch>/<path>) or a " +
  "raw.githubusercontent.com / gist.githubusercontent.com URL.";

const RAW_HOSTS = new Set(["raw.githubusercontent.com", "gist.githubusercontent.com"]);
const PAGE_HOSTS = new Set(["github.com", "www.github.com"]);

export function toGithubRawUrl(input: string): GithubUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: `That isn't a valid URL. ${ACCEPTED}` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: `Only https links are supported. ${ACCEPTED}` };
  }
  const host = url.hostname.toLowerCase();
  if (RAW_HOSTS.has(host)) {
    url.protocol = "https:";
    url.hash = "";
    return { ok: true, url: url.toString() };
  }
  if (PAGE_HOSTS.has(host)) {
    // /<owner>/<repo>/(blob|raw)/<ref…>/<path…> — at least one path segment after the ref.
    const parts = url.pathname.split("/").filter(Boolean);
    const [owner, repo, kind, ...rest] = parts;
    if (owner && repo && (kind === "blob" || kind === "raw") && rest.length >= 2) {
      return {
        ok: true,
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`,
      };
    }
    return { ok: false, error: `That GitHub link doesn't point to a file. ${ACCEPTED}` };
  }
  return { ok: false, error: `Only GitHub URLs are supported. ${ACCEPTED}` };
}
