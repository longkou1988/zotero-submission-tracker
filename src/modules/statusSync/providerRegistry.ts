import type { ProviderKind } from "./types";

const SPRINGER_HOST = "submission.springernature.com";
const SPRINGER_PATH_PREFIX = "/submission-details/";

export function isSpringerNatureSubmissionUrl(
  statusUrl: string | null,
): boolean {
  if (!statusUrl) {
    return false;
  }
  try {
    const url = new URL(statusUrl);
    if (url.protocol !== "https:") {
      return false;
    }
    if (url.hostname !== SPRINGER_HOST) {
      return false;
    }
    if (!url.pathname.startsWith(SPRINGER_PATH_PREFIX)) {
      return false;
    }
    return url.pathname.slice(SPRINGER_PATH_PREFIX.length).length > 0;
  } catch {
    return false;
  }
}

export function recognizeProvider(
  statusUrl: string | null,
): ProviderKind | null {
  return isSpringerNatureSubmissionUrl(statusUrl) ? "springer_nature" : null;
}
