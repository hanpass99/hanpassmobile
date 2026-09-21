/**
 * Pure unit tests for the partner application contract.
 * No database, no network, no secrets. Run with: bunx bun test src/lib
 */
import { describe, expect, it } from "bun:test";
import {
  applicationRequestSchema,
  buildFullName,
  buildProductSnapshot,
  canonicalize,
  integrationEnabled,
  normalizeNameKey,
  normalizePhone,
  requestHash,
  resolvePartnerId,
  SUPPORTED_LOCALES,
  timingSafeEqualStr,
} from "../src/lib/partner-api";

const validRequest = () => ({
  externalApplicationId: "hp-20260921-0001",
  source: "nh_allone",
  locale: "mn",
  applicant: {
    firstName: "Bat",
    middleName: null,
    lastName: "Erdene",
    phone: "010-1234-5678",
    nationality: "MN",
  },
  product: {
    code: "sk-light49",
    type: "sim",
    name: "SK Light 49",
    carrier: "SKT",
    monthlyFee: 26750,
    deviceModel: null,
    devicePrice: null,
    contractMonths: 12,
    bundledPlanCode: null,
    currency: "KRW",
  },
  consent: { accepted: true, version: "privacy-v3", acceptedAt: "2026-09-21T07:00:00Z" },
  submittedAt: "2026-09-21T07:00:05Z",
});

describe("schema", () => {
  it("accepts a valid sim application", () => {
    expect(applicationRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("accepts a bundle application with device fields", () => {
    const r = validRequest();
    r.product = {
      ...r.product,
      code: "bundle-a175",
      type: "bundle",
      name: "Bundle A17 5G",
      deviceModel: "Galaxy A17 5G",
      devicePrice: 0, // genuinely free device
      bundledPlanCode: "lg-hanpass7",
    } as any;
    const parsed = applicationRequestSchema.safeParse(r);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.product.devicePrice).toBe(0);
  });

  it("keeps null and 0 distinct for money fields", () => {
    const zero = validRequest();
    zero.product.monthlyFee = 0;
    const nulled = validRequest();
    (nulled.product as any).monthlyFee = null;
    const a = applicationRequestSchema.parse(zero);
    const b = applicationRequestSchema.parse(nulled);
    expect(a.product.monthlyFee).toBe(0);
    expect(b.product.monthlyFee).toBeNull();
    expect(a.product.monthlyFee).not.toBe(b.product.monthlyFee as any);
  });

  it("rejects non-integer, negative and oversized amounts", () => {
    for (const v of [1000.5, -1, 999_999_999_999]) {
      const r = validRequest();
      r.product.monthlyFee = v;
      expect(applicationRequestSchema.safeParse(r).success).toBe(false);
    }
  });

  it("rejects device fields on a sim product", () => {
    const r = validRequest();
    (r.product as any).deviceModel = "Galaxy A17 5G";
    expect(applicationRequestSchema.safeParse(r).success).toBe(false);
  });

  it("requires ISO alpha-2 nationality", () => {
    for (const bad of ["MNG", "mn", "M1", ""]) {
      const r = validRequest();
      r.applicant.nationality = bad;
      expect(applicationRequestSchema.safeParse(r).success).toBe(false);
    }
  });

  it("accepts all 14 locales and rejects others", () => {
    expect(SUPPORTED_LOCALES.length).toBe(14);
    for (const l of SUPPORTED_LOCALES) {
      const r = validRequest();
      r.locale = l;
      expect(applicationRequestSchema.safeParse(r).success).toBe(true);
    }
    const bad = validRequest();
    bad.locale = "fr" as any;
    expect(applicationRequestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts only nh_allone and hanpass_web as source", () => {
    for (const s of ["nh_allone", "hanpass_web"]) {
      const r = validRequest();
      r.source = s;
      expect(applicationRequestSchema.safeParse(r).success).toBe(true);
    }
    const bad = validRequest();
    bad.source = "somewhere_else";
    expect(applicationRequestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unaccepted consent", () => {
    const r = validRequest();
    (r.consent as any).accepted = false;
    expect(applicationRequestSchema.safeParse(r).success).toBe(false);
  });

  it("rejects a malformed submittedAt", () => {
    const r = validRequest();
    r.submittedAt = "not-a-date-at-all";
    expect(applicationRequestSchema.safeParse(r).success).toBe(false);
  });
});

describe("normalization", () => {
  it("normalizes Korean mobile formats identically", () => {
    for (const v of ["01012345678", "010-1234-5678", "+82 10 1234 5678", "821012345678"]) {
      expect(normalizePhone(v)).toBe("010-1234-5678");
    }
  });

  it("returns null for unsupported numbers", () => {
    for (const v of ["12345", "", null, undefined, "0212345678"]) {
      expect(normalizePhone(v as any)).toBeNull();
    }
  });

  it("builds a full name and a comparison key", () => {
    expect(buildFullName({ firstName: "Bat", middleName: null, lastName: "Erdene" })).toBe(
      "Erdene Bat"
    );
    expect(buildFullName({ firstName: "Bat", middleName: "Od", lastName: "Erdene" })).toBe(
      "Erdene Od Bat"
    );
    expect(normalizeNameKey("  Erdene   BAT ")).toBe(normalizeNameKey("erdene bat"));
  });
});

describe("hashing", () => {
  it("is stable regardless of key order", async () => {
    const a = await requestHash({ x: 1, y: { b: 2, a: 3 } });
    const b = await requestHash({ y: { a: 3, b: 2 }, x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the product changes", async () => {
    const base = applicationRequestSchema.parse(validRequest());
    const other = applicationRequestSchema.parse({
      ...validRequest(),
      product: { ...validRequest().product, code: "lg-hanpass7", carrier: "LGU+" },
    });
    expect(await requestHash(base)).not.toBe(await requestHash(other));
  });

  it("canonicalizes nested arrays deterministically", () => {
    expect(canonicalize({ b: [2, { d: 1, c: 2 }], a: 1 })).toBe('{"a":1,"b":[2,{"c":2,"d":1}]}');
  });
});

describe("product snapshot", () => {
  it("stores partner-provided values verbatim", () => {
    const req = applicationRequestSchema.parse(validRequest());
    expect(buildProductSnapshot(req)).toEqual({
      code: "sk-light49",
      type: "sim",
      name: "SK Light 49",
      carrier: "SKT",
      monthlyFee: 26750,
      deviceModel: null,
      devicePrice: null,
      contractMonths: 12,
      bundledPlanCode: null,
      currency: "KRW",
    });
  });
});

describe("gating", () => {
  it("enables only on an exact \"true\"", () => {
    for (const v of [undefined, "", "false", "TRUE", "1", "true "]) {
      expect(integrationEnabled(v)).toBe(false);
    }
    expect(integrationEnabled("true")).toBe(true);
  });

  it("resolves a partner id only for an exact key match", () => {
    const spec = "nh:AAA,hp:BBB";
    expect(resolvePartnerId(spec, "AAA")).toBe("nh");
    expect(resolvePartnerId(spec, "BBB")).toBe("hp");
    expect(resolvePartnerId(spec, "aaa")).toBeNull();
    expect(resolvePartnerId(spec, "")).toBeNull();
    expect(resolvePartnerId(undefined, "AAA")).toBeNull();
  });

  it("compares strings without early exit", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});
