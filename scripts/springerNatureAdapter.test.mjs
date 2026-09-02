import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  redactSpringerProbeText,
  runSpringerProbe,
} from "../src/modules/statusSync/springerProbe.ts";

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
