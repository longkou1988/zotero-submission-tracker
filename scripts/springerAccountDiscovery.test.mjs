import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  buildSpringerAccountDiagnostics,
  parseSpringerAccountDocument,
  resolveSpringerSubmissionIdentity,
  SpringerAccountDiscovery,
  toSpringerDiscoveryCheckResult,
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

test("account scanner resolves direct SNAPP identity and keeps Editorial Manager cards unresolved", async () => {
  const fixture = readAccountFixture();
  const requested = [];
  const scanner = new SpringerAccountDiscovery({
    session: {
      async requestSpringer(url) {
        requested.push(url);
        return { finalUrl: url, documentHTML: "<account/>" };
      },
    },
    parseDocument(documentHTML) {
      assert.equal(documentHTML, "<account/>");
      return fakeAccountDocument(fixture);
    },
  });

  const result = await scanner.scanAccount();

  assert.deepEqual(requested, [
    "https://link.springernature.com/home/?tab=submitted",
  ]);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.unresolved.length, 3);
  assert.deepEqual(
    result.resolved.map((item) => ({
      index: item.index,
      sourceSystem: item.sourceSystem,
      providerSubmissionId: item.providerSubmissionId,
    })),
    [
      {
        index: 1,
        sourceSystem: "snapp",
        providerSubmissionId: "[id]",
      },
    ],
  );
  assert.deepEqual(
    result.unresolved.map((item) => ({
      index: item.index,
      sourceSystem: item.sourceSystem,
      reason: item.unresolvedReason,
    })),
    [
      {
        index: 2,
        sourceSystem: "editorial_manager",
        reason: "requires_runtime_resolution",
      },
      {
        index: 3,
        sourceSystem: "editorial_manager",
        reason: "requires_runtime_resolution",
      },
      {
        index: 4,
        sourceSystem: "editorial_manager",
        reason: "requires_runtime_resolution",
      },
    ],
  );
});

test("account scanner never invents identity for a submission card with a missing title", async () => {
  const fixture = {
    cards: [
      {
        title: "   ",
        subtitle: "Synthetic Journal",
        status: "Submitted",
        lastUpdated: "Last updated 1 Sep 2026",
        linkMarker: "submission-card-link--snapp",
        href: "https://submission.springernature.com/submission-details/example-id",
      },
    ],
  };
  const scanner = new SpringerAccountDiscovery({
    session: {
      async requestSpringer(url) {
        return { finalUrl: url, documentHTML: "<account/>" };
      },
    },
    parseDocument() {
      return fakeAccountDocument(fixture);
    },
  });

  const result = await scanner.scanAccount();

  assert.equal(result.resolved.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].index, 1);
  assert.equal(result.unresolved[0].unresolvedReason, "missing_title");
  assert.equal(result.unresolved[0].entryUrl.includes("example-id"), true);
});

test("development discovery check redacts all private submission metadata", () => {
  const result = toSpringerDiscoveryCheckResult({
    resolved: [
      {
        index: 1,
        sourceSystem: "snapp",
        title: "Private Manuscript Title",
        journal: "Private Journal",
        rawStatus: "Action needed",
        lastUpdatedText: "Last updated yesterday",
        entryUrl:
          "https://submission.springernature.com/submission-details/private-id?token=secret",
        providerSubmissionId: "private-id",
        statusUrl:
          "https://submission.springernature.com/submission-details/private-id",
      },
    ],
    unresolved: [
      {
        index: 2,
        sourceSystem: "editorial_manager",
        title: "Second Private Title",
        journal: "Second Private Journal",
        rawStatus: "Under review",
        lastUpdatedText: "Last updated today",
        entryUrl:
          "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
        unresolvedReason: "requires_runtime_resolution",
      },
    ],
  });

  assert.deepEqual(result, {
    cardCount: 2,
    resolvedCount: 1,
    unresolvedCount: 1,
    cards: [
      {
        index: 1,
        sourceSystem: "snapp",
        resolution: "resolved",
        finalPage: "submission_details",
        providerSubmissionIdRedacted: "[id]",
        reason: null,
      },
      {
        index: 2,
        sourceSystem: "editorial_manager",
        resolution: "unresolved",
        finalPage: "not_followed",
        providerSubmissionIdRedacted: null,
        reason: "requires_runtime_resolution",
      },
    ],
  });

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "Private Manuscript Title",
    "Private Journal",
    "private-id",
    "token",
    "secret",
    "Second Private Title",
    "Second Private Journal",
    "documentHTML",
    "entryUrl",
    "rawStatus",
    "email",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("runtime diagnostics expose only safe location and structural signals", () => {
  const html = `
    <main data-test="research-tracker-container">
      <div data-test="research-tracker-count-label">4 submissions</div>
      <div data-test="submissions-list">
        <article data-test="research-tracker-item">Private Manuscript Title</article>
        <article data-test="research-tracker-item">Second Private Title</article>
      </div>
    </main>`;

  const result = buildSpringerAccountDiagnostics({
    finalUrl: "https://link.springernature.com/home/?tab=submitted&token=secret",
    documentHTML: html,
  });

  assert.deepEqual(result, {
    finalOrigin: "https://link.springernature.com",
    finalPath: "/home/",
    documentLength: html.length,
    hasResearchTrackerContainer: true,
    hasSubmissionsList: true,
    hasCountLabel: true,
    trackerItemMarkerCount: 2,
  });

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "Private Manuscript Title",
    "Second Private Title",
    "token",
    "secret",
    "documentHTML",
    "tab=submitted",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("discovery check is development-only and production discovery code does not access browser secrets", () => {
  const addonSource = readFileSync(new URL("../src/addon.ts", import.meta.url), "utf8");
  const discoverySource = readFileSync(
    new URL("../src/modules/statusSync/springerAccountDiscovery.ts", import.meta.url),
    "utf8",
  );

  assert.match(addonSource, /runSpringerDiscoveryCheck\?:/);
  assert.match(
    addonSource,
    /if\s*\(this\.data\.env\s*===\s*["']development["']\)[\s\S]*runSpringerDiscoveryCheck/,
  );

  for (const forbidden of [
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "Authorization",
  ]) {
    assert.equal(discoverySource.includes(forbidden), false, forbidden);
  }
});
