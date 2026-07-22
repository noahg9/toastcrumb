// Injects the full, private content library into content/concepts/ before build.
//
// Open-core model: the app is public, the content library is not. The public repo
// commits a small sample so local dev and CI build with no secrets. Production
// (Vercel) sets CONTENT_REPO_TOKEN, and this script overlays the full library.
//
//   CONTENT_REPO_TOKEN  read-only token with access to the private content repo
//   CONTENT_REPO        host/owner/repo (default: github.com/noahg9/toastcrumb-internal)
//   CONTENT_REPO_REF    branch/tag to pull (default: main)
//
// No token → no-op (the committed sample content is used as-is).
// Token set but fetch fails → exit non-zero, so a misconfigured deploy fails
// loudly instead of silently shipping an app with no content.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.CONTENT_REPO_TOKEN;
const repo = process.env.CONTENT_REPO ?? "github.com/noahg9/toastcrumb-internal";
const ref = process.env.CONTENT_REPO_REF ?? "main";

if (!token) {
  console.log("[content] No CONTENT_REPO_TOKEN set — using committed sample content.");
  process.exit(0);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "tc-content-"));
// x-access-token auth keeps the token out of the recorded remote URL/args logs below.
const cloneUrl = `https://x-access-token:${token}@${repo}.git`;

try {
  // Shallow, blobless, sparse — pull only content/, not the whole private repo.
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", ref, cloneUrl, tmp],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  execFileSync("git", ["-C", tmp, "sparse-checkout", "set", "content/concepts"], {
    stdio: "inherit",
  });

  const src = path.join(tmp, "content", "concepts");
  const dest = path.join(repoRoot, "content", "concepts");
  cpSync(src, dest, { recursive: true });
  console.log(`[content] Overlaid full content library from ${repo}@${ref}.`);
} catch (err) {
  console.error(
    "[content] CONTENT_REPO_TOKEN is set but fetching the content library failed. " +
      "Refusing to build with incomplete content.",
  );
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
