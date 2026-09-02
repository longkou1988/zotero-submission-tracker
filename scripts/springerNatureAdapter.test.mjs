import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  redactSpringerProbeText,
  runSpringerProbe,
} from "../src/modules/statusSync/springerProbe.ts";
import {
  normalizeSpringerObservation,
  parseSpringerStatusFields,
} from "../src/modules/statusSync/springerNatureAdapter.ts";

function fakeElement(tagName, textContent, attrs = {}) {
  return {
    tagName,
    textContent,
    getAttributeNames() {
      return Object.keys(attrs);
    },
    getAttribute(name) {
      return attrs[name] ?? null;
    },
  };
}

function readActionNeededFixture() {
  return JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/springer-nature/submission-details-action-needed.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

test("probe redaction removes private submission identifiers and email addresses", () => {
  const input =
    "https://submission.springernature.com/submission-details/123e4567-e89b-12d3-a456-426614174000?email=author@example.com";
  const redacted = redactSpringerProbeText(input);

  assert.equal(redacted.includes("123e4567-e89b-12d3-a456-426614174000"), false);
  assert.equal(redacted.includes("author@example.com"), false);
  assert.match(redacted, /submission-details\/\[submission-id\]/);
});

test("probe returns status-safe DOM markers and redacted request paths only", async () => {
  const documentLike = {
    querySelectorAll() {
      return [
        fakeElement("DIV", "Under Review", {
          "data-testid": "submission-status",
        }),
        fakeElement("H1", "A Review of Artificial Intelligence Adoption", {
          class: "status-page-title",
        }),
        fakeElement("SPAN", "author@example.com", { class: "author-email" }),
      ];
    },
  };
  const performanceLike = {
    getEntriesByType() {
      return [
        {
          name: "https://submission.springernature.com/api/submission-details/123e4567-e89b-12d3-a456-426614174000/status?token=secret-value",
        },
        { name: "https://example.com/unrelated.js" },
      ];
    },
  };

  const result = await runSpringerProbe({ documentLike, performanceLike });
  const serialized = JSON.stringify(result);

  assert.deepEqual(
    result.domCandidates.map((candidate) => candidate.statusText),
    ["Under Review", null],
  );
  assert.deepEqual(result.requestPaths, [
    "https://submission.springernature.com/api/submission-details/[submission-id]/status",
  ]);
  assert.equal(serialized.includes("Artificial Intelligence Adoption"), false);
  assert.equal(serialized.includes("author@example.com"), false);
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("123e4567-e89b-12d3-a456-426614174000"), false);
});

test("probe source never serializes browser secrets or full HTML", () => {
  const source = readFileSync(
    new URL("../src/modules/statusSync/springerProbe.ts", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "document.documentElement.outerHTML",
    ".cookie",
    "localStorage",
    "sessionStorage",
    "Authorization",
    "innerHTML",
    "outerHTML",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("probe is exposed only through the development API and never a user menu", () => {
  const addonSource = readFileSync(
    new URL("../src/addon.ts", import.meta.url),
    "utf8",
  );
  const menuSource = readFileSync(
    new URL("../src/modules/menu.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    addonSource,
    /import\s*\{\s*runSpringerProbe\s*\}\s*from\s*["']\.\/modules\/statusSync\/springerProbe["']/,
  );
  assert.match(addonSource, /runSpringerProbe\?\s*:/);
  assert.match(
    addonSource,
    /if\s*\(this\.data\.env\s*===\s*["']development["']\)\s*\{[^}]*this\.api\.runSpringerProbe\s*=\s*runSpringerProbe/s,
  );
  assert.doesNotMatch(menuSource, /runSpringerProbe|springerProbe/i);
});

test("real redacted Springer fixture contains no private identifiers", () => {
  const fixture = readActionNeededFixture();
  const serialized = JSON.stringify(fixture);

  assert.equal(serialized.includes("@"), false);
  assert.equal(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      serialized,
    ),
    false,
  );
  assert.equal(serialized.includes("[email]"), true);
  assert.equal(serialized.includes("[id]"), true);
});

test("Action needed fixture is recognized as a generic revision request only", () => {
  const fixture = readActionNeededFixture();
  const observation = parseSpringerStatusFields({
    headline: fixture.dom.headline,
    texts: fixture.dom.text,
  });
  const normalization = normalizeSpringerObservation(observation);

  assert.equal(observation.rawStatus, "Action needed");
  assert.equal(observation.detailCode, "revision_requested");
  assert.equal(observation.sourceStatusDate, null);
  assert.deepEqual(normalization, {
    canonicalStatus: null,
    confidence: "unknown",
    detailLabel: "Revision requested",
  });
});

test("revision due date is not treated as a provider status date", () => {
  const fixture = readActionNeededFixture();
  const observation = parseSpringerStatusFields({
    headline: fixture.dom.headline,
    texts: fixture.dom.text,
  });

  assert.equal(observation.sourceStatusDate, null);
  assert.equal(observation.revisionDueDate, "2026-09-15");
});

test("session manager reuses Zotero default web session without reading cookies", () => {
  const source = readFileSync(
    new URL("../src/modules/statusSync/sessionManager.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /chrome:\/\/zotero\/content\/zotero\/HiddenBrowser\.mjs/);
  assert.match(source, /new\s+HiddenBrowser\s*\(\s*\{\s*allowJavaScript:\s*true\s*\}\s*\)/s);
  assert.match(source, /getPageData\s*\(\s*\[\s*["']documentHTML["']\s*\]\s*\)/);
  assert.match(source, /waitForDocument/);
  assert.match(source, /destroy\s*\(\s*\)/);
  assert.doesNotMatch(source, /newCookieContext|userContextId|usercontextid/i);
  assert.doesNotMatch(source, /getDocument\s*\(/);
  assert.doesNotMatch(source, /getPageData\s*\([^)]*["']cookie["']/s);
  assert.doesNotMatch(source, /localStorage|sessionStorage|Authorization/);
  assert.doesNotMatch(source, /log\s*\([^)]*documentHTML/s);
});
