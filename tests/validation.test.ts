import { describe, expect, it } from "vitest";
import { assertNoSensitiveKeys, validateBackup } from "../src/core/validation";
import { fixture } from "./fixtures";

describe("backup validation", () => {
  it("accepts a complete round-trip payload", () => {
    const original = fixture();
    expect(validateBackup(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("rejects unknown versions, broken references and invalid dates with locations", () => {
    expect(() => validateBackup({ ...fixture(), schemaVersion: 2 })).toThrow(/schemaVersion/);
    const broken = fixture();
    broken.statusEvents[0].submissionId = "missing";
    expect(() => validateBackup(broken)).toThrow(/statusEvents\[0\]\.submissionId/);
    const badDate = fixture();
    badDate.submissions[0].submissionDate = "2026-02-30";
    expect(() => validateBackup(badDate)).toThrow(/submissions\[0\]\.submissionDate/);
    expect(() => validateBackup({ ...fixture(), exportedAt: "2026-08-24" })).toThrow(/exportedAt/);
  });

  it("rejects sensitive field names anywhere in a backup", () => {
    expect(() => assertNoSensitiveKeys({ nested: { password: "never" } })).toThrow(/forbidden sensitive field/);
    expect(() => assertNoSensitiveKeys({ accessToken: "never" })).toThrow(/forbidden sensitive field/);
  });
});
