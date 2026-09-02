import assert from "node:assert/strict";
import test from "node:test";
import {
  isSpringerNatureSubmissionUrl,
  recognizeProvider,
} from "../src/modules/statusSync/providerRegistry.ts";

test("recognizes an HTTPS Springer Nature submission-details URL", () => {
  const url =
    "https://submission.springernature.com/submission-details/8622dda6-8179-49d7-9ad9-bbda50fb382b";
  assert.equal(isSpringerNatureSubmissionUrl(url), true);
  assert.equal(recognizeProvider(url), "springer_nature");
});

test("rejects wrong host, HTTP, empty identifier and deceptive suffix", () => {
  const bad = [
    "http://submission.springernature.com/submission-details/abc",
    "https://example.com/submission-details/abc",
    "https://submission.springernature.com/submission-details/",
    "https://submission.springernature.com.evil.example/submission-details/abc",
  ];
  for (const url of bad) {
    assert.equal(recognizeProvider(url), null);
  }
});

test("null and malformed URLs are unsupported", () => {
  assert.equal(recognizeProvider(null), null);
  assert.equal(recognizeProvider("not a url"), null);
});
