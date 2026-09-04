import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  parseSpringerAccountDocument,
  resolveSpringerSubmissionIdentity,
} from "../src/modules/statusSync/springerAccountDiscovery.ts";

function readAccountFixture() {
  return JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/springer-nature/account-submitted-mixed-systems.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

function fakeTextElement(textContent, attrs = {}) {
  return {
    textContent,
    href: attrs.href || "",
    getAttribute(name) {
      return attrs[name] ?? null;
    },
  };
}

function fakeAccountDocument(fixture) {
  const cards = fixture.cards.map((card) => ({
    querySelector(selector) {
      if (selector === '[data-test="research-content-card-title"]') {
        return fakeTextElement(card.title);
      }
      if (selector === '[data-test="research-content-card-subtitle"]') {
        return fakeTextElement(card.subtitle);
      }
      if (selector === '[data-test="research-content-card-status-info"]') {
        return fakeTextElement(card.status);
      }
      if (selector === '[data-test="research-content-card-last-updated"]') {
        return fakeTextElement(card.lastUpdated);
      }
      if (selector === `[data-test="${card.linkMarker}"]`) {
        return fakeTextElement("Open", {
          "data-test": card.linkMarker,
          href: card.href,
        });
      }
      return null;
    },
  }));

  return {
    querySelectorAll(selector) {
      if (selector === '[data-test="research-tracker-item"]') {
        return cards;
      }
      return [];
    },
  };
}

test("redacted account fixture contains mixed SNAPP and Editorial Manager cards only", () => {
  const fixture = readAccountFixture();
  const serialized = JSON.stringify(fixture);

  assert.equal(fixture.cards.length, 4);
  assert.equal(serialized.includes("@"), false);
  assert.equal(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      serialized,
    ),
    false,
  );
  assert.equal(
    fixture.cards.filter((card) => card.linkMarker === "submission-card-link--snapp")
      .length,
    1,
  );
  assert.equal(
    fixture.cards.filter((card) => card.linkMarker === "submission-card-link--em")
      .length,
    3,
  );
});

test("account parser extracts four observed submission cards and source systems", () => {
  const fixture = readAccountFixture();
  const candidates = parseSpringerAccountDocument(fakeAccountDocument(fixture));

  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].sourceSystem, "snapp");
  assert.equal(candidates[1].sourceSystem, "editorial_manager");
  assert.equal(candidates[0].title, "Synthetic Manuscript A");
  assert.equal(candidates[0].journal, "Synthetic Journal A");
  assert.equal(candidates[0].rawStatus, "Action needed");
  assert.equal(candidates[0].lastUpdatedText, "Last updated 1 Sep 2026");
  assert.equal(
    candidates[1].entryUrl,
    "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
  );
});

test("account parser normalizes card whitespace without inventing missing fields", () => {
  const documentLike = {
    querySelectorAll(selector) {
      if (selector !== '[data-test="research-tracker-item"]') return [];
      return [
        {
          querySelector(innerSelector) {
            if (innerSelector === '[data-test="research-content-card-title"]') {
              return fakeTextElement("  Synthetic\n Manuscript   E  ");
            }
            if (innerSelector === '[data-test="submission-card-link--snapp"]') {
              return fakeTextElement("Open", {
                href: "https://submission.springernature.com/submission-details/example-id",
              });
            }
            return null;
          },
        },
      ];
    },
  };

  const [candidate] = parseSpringerAccountDocument(documentLike);

  assert.equal(candidate.title, "Synthetic Manuscript E");
  assert.equal(candidate.journal, null);
  assert.equal(candidate.rawStatus, null);
  assert.equal(candidate.lastUpdatedText, null);
});

test("durable identity accepts only final Springer submission-details URLs", () => {
  assert.deepEqual(
    resolveSpringerSubmissionIdentity(
      "https://submission.springernature.com/submission-details/example-id?_gl=redacted#fragment",
    ),
    {
      providerSubmissionId: "example-id",
      statusUrl:
        "https://submission.springernature.com/submission-details/example-id",
    },
  );

  assert.equal(
    resolveSpringerSubmissionIdentity(
      "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
    ),
    null,
  );
  assert.equal(
    resolveSpringerSubmissionIdentity(
      "http://submission.springernature.com/submission-details/example-id",
    ),
    null,
  );
  assert.equal(
    resolveSpringerSubmissionIdentity(
      "https://submission.springernature.com/submission-details/",
    ),
    null,
  );
});
