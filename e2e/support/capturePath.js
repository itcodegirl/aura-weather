/*
 * Where a capture spec writes its image.
 *
 * These specs used to write straight into the committed paths, which meant
 * any `npm run test:e2e` -- CI's, or a contributor's -- silently rewrote six
 * tracked PNGs. The diff is binary, so it does not show up in a skim of
 * `git diff`, and it has been committed by accident more than once.
 *
 * Every capture now lands under test-results/ (already gitignored) at the
 * same relative path it would occupy in the repo. Promoting a fresh set into
 * the tracked files is `npm run screenshots`, whose whole job that is.
 *
 * Deliberately not an env-var mode switch: a new capture spec written six
 * months from now gets the safe behaviour by calling this helper like its
 * neighbours, with no flag to know about and no way to opt in by accident.
 */

export const CAPTURE_ROOT = "test-results/captures";

export function capturePath(repoRelativePath) {
  if (typeof repoRelativePath !== "string" || !repoRelativePath) {
    throw new Error("capturePath needs the repo-relative path it stands in for");
  }
  if (repoRelativePath.startsWith("/") || repoRelativePath.includes("..")) {
    throw new Error(`capturePath expects a repo-relative path: ${repoRelativePath}`);
  }
  return `${CAPTURE_ROOT}/${repoRelativePath}`;
}
