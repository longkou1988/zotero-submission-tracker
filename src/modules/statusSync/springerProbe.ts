const SUBMISSION_PATH_PATTERN = /submission-details\/[^/?#\s]+/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET_QUERY_PATTERN =
  /([?&](?:token|access_token|id_token|code|key|secret|signature)=)[^&#\s]+/gi;
const STRUCTURE_MARKER_PATTERN =
  /(status|stage|decision|review|revision|submission-state)/i;
const NETWORK_PATH_PATTERN =
  /(submission|status|stage|decision|review|revision)/i;

const SAFE_STATUS_TEXT = new Set([
  "submitted",
  "submission received",
  "with editor",
  "editor assigned",
  "editor invited",
  "under review",
  "reviewers invited",
  "reviewer assigned",
  "reviews completed",
  "decision pending",
  "decision in process",
  "major revision",
  "minor revision",
  "revision requested",
  "accepted",
  "rejected",
  "withdrawn",
]);

interface ProbeElementLike {
  tagName?: string;
  textContent?: string | null;
  getAttributeNames?(): string[];
  getAttribute?(name: string): string | null;
}

interface ProbeDocumentLike {
  querySelectorAll(selector: string): ArrayLike<ProbeElementLike>;
}

interface ProbePerformanceEntryLike {
  name?: string;
}

interface ProbePerformanceLike {
  getEntriesByType(type: string): ArrayLike<ProbePerformanceEntryLike>;
}

export interface SpringerProbeInput {
  documentLike?: ProbeDocumentLike | null;
  performanceLike?: ProbePerformanceLike | null;
}

export interface SpringerProbeDomCandidate {
  tag: string;
  markers: string[];
  statusText: string | null;
}

export interface SpringerProbeResult {
  observedAt: string;
  domCandidates: SpringerProbeDomCandidate[];
  requestPaths: string[];
}

export function redactSpringerProbeText(input: string): string {
  return input
    .replace(SUBMISSION_PATH_PATTERN, "submission-details/[submission-id]")
    .replace(UUID_PATTERN, "[id]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(SECRET_QUERY_PATTERN, "$1[redacted]");
}

export async function runSpringerProbe(
  input: SpringerProbeInput,
): Promise<SpringerProbeResult> {
  return {
    observedAt: new Date().toISOString(),
    domCandidates: collectDomCandidates(input.documentLike ?? null),
    requestPaths: collectRequestPaths(input.performanceLike ?? null),
  };
}

function collectDomCandidates(
  documentLike: ProbeDocumentLike | null,
): SpringerProbeDomCandidate[] {
  if (!documentLike) {
    return [];
  }

  const candidates: SpringerProbeDomCandidate[] = [];
  const nodes = documentLike.querySelectorAll("*");
  for (
    let index = 0;
    index < nodes.length && candidates.length < 100;
    index++
  ) {
    const node = nodes[index];
    const markers = collectStructureMarkers(node);
    if (!markers.length) {
      continue;
    }
    candidates.push({
      tag: String(node.tagName || "unknown").toLowerCase(),
      markers,
      statusText: safeStatusText(node.textContent),
    });
  }
  return candidates;
}

function collectStructureMarkers(node: ProbeElementLike): string[] {
  const names = node.getAttributeNames?.() ?? [];
  const markers: string[] = [];
  for (const name of names) {
    const value = node.getAttribute?.(name) ?? "";
    if (!STRUCTURE_MARKER_PATTERN.test(`${name} ${value}`)) {
      continue;
    }
    const safeName = redactSpringerProbeText(name).slice(0, 80);
    const safeValue = safeMarkerValue(value);
    markers.push(safeValue ? `${safeName}=${safeValue}` : safeName);
  }
  return [...new Set(markers)].slice(0, 8);
}

function safeMarkerValue(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 80 ||
    !STRUCTURE_MARKER_PATTERN.test(trimmed)
  ) {
    return "";
  }
  return redactSpringerProbeText(trimmed).replace(/\s+/g, " ");
}

function safeStatusText(value: string | null | undefined): string | null {
  const trimmed = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 80) {
    return null;
  }
  return SAFE_STATUS_TEXT.has(trimmed.toLocaleLowerCase()) ? trimmed : null;
}

function collectRequestPaths(
  performanceLike: ProbePerformanceLike | null,
): string[] {
  if (!performanceLike) {
    return [];
  }

  const paths: string[] = [];
  const entries = performanceLike.getEntriesByType("resource");
  for (let index = 0; index < entries.length && paths.length < 100; index++) {
    const name = entries[index]?.name;
    if (!name) {
      continue;
    }
    const safePath = springerRequestPath(name);
    if (safePath) {
      paths.push(safePath);
    }
  }
  return [...new Set(paths)];
}

function springerRequestPath(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    if (
      hostname !== "springernature.com" &&
      !hostname.endsWith(".springernature.com")
    ) {
      return null;
    }
    if (!NETWORK_PATH_PATTERN.test(url.pathname)) {
      return null;
    }
    return redactSpringerProbeText(`${url.origin}${url.pathname}`);
  } catch {
    return null;
  }
}
