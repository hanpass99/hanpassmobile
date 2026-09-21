/**
 * Mock-based tests for the append-only intake semantics.
 *
 * IMPORTANT: this is a JavaScript in-memory simulation of the route logic and
 * of two PostgreSQL unique indexes. It does NOT exercise PostgreSQL,
 * transactions, triggers or real concurrency, and must NOT be read as proof of
 * database-level correctness. No claim about the real database is made here.
 */
import { describe, expect, it } from "bun:test";
import {
  applicationRequestSchema,
  buildFullName,
  buildHashPayload,
  buildNotes,
  deriveCustomerId,
  encodeMarker,
  kstDate,
  mapCustomerStatus,
  markerMatches,
  markerScopeMatches,
  normalizePhone,
  parseMarker,
  requestHash,
  resolvePartnerId,
  UNKNOWN_NATIONALITY,
  type ApplicationRequest,
  type MarkerPayload,
} from "../src/lib/partner-api";

/* ---------------- in-memory stand-in for public.customers ---------------- */

type Row = {
  id: string;
  name: string;
  phone: string;
  pool: string;
  status: string;
  signup_date: string;
  application_date: string;
  requested_plan: string | null;
  monthly_fee: number | null;
  customer_type: string | null;
  country_id: string | null;
  assigned_to: string | null;
  call_round: number | null;
  notes: string | null;
  created_at: string;
};

class Db {
  rows: Row[] = [];
  countries = [{ id: "country-mn", code: "MN" }];
  /** Writes the simulation is allowed to observe — used to prove append-only. */
  ops: string[] = [];

  selectById(id: string) {
    this.ops.push("select");
    return this.rows.find((r) => r.id === id) ?? null;
  }

  countryIdByCode(code: string) {
    this.ops.push("select");
    return this.countries.find((c) => c.code === code)?.id ?? null;
  }

  insert(row: Row): { error?: { code: string } } {
    this.ops.push("insert");
    if (this.rows.some((r) => r.id === row.id)) return { error: { code: "23505" } };
    // partial unique index: (name, phone, signup_date) where pool = activation_request
    if (
      row.pool === "activation_request" &&
      this.rows.some(
        (r) =>
          r.pool === "activation_request" &&
          r.name === row.name &&
          r.phone === row.phone &&
          r.signup_date === row.signup_date
      )
    ) {
      return { error: { code: "23505" } };
    }
    this.rows.push(row);
    return {};
  }
}

type Result = { status: number; body: Record<string, unknown> };

/** Mirrors the POST handler, minus HTTP plumbing. */
async function post(
  db: Db,
  opts: { apiKey: string; keySpec: string; idempotencyKey?: string; req: ApplicationRequest }
): Promise<Result> {
  const partnerId = resolvePartnerId(opts.keySpec, opts.apiKey);
  if (!partnerId) return { status: 401, body: { error: "unauthorized" } };

  const data = opts.req;
  const idem = opts.idempotencyKey ?? data.externalApplicationId;
  if (idem.toLowerCase() !== data.externalApplicationId.toLowerCase()) {
    return { status: 400, body: { error: "idempotency_key_mismatch" } };
  }

  const phone = normalizePhone(data.applicant.phone)!;
  const hash = await requestHash(buildHashPayload(data, phone));
  const id = await deriveCustomerId(partnerId, data.externalApplicationId);
  const expected: MarkerPayload = {
    partnerId,
    externalApplicationId: data.externalApplicationId,
    idempotencyKey: data.externalApplicationId,
    requestHash: hash,
  };

  const replayOrConflict = (row: Row): Result =>
    markerMatches(parseMarker(row.notes), expected)
      ? {
          status: 200,
          body: { result: "replayed", applicationId: row.id, status: mapCustomerStatus(row.status) },
        }
      : { status: 409, body: { error: "marker_mismatch" } };

  const existing = db.selectById(id);
  if (existing) return replayOrConflict(existing);

  const countryId =
    data.applicant.nationality === UNKNOWN_NATIONALITY
      ? null
      : db.countryIdByCode(data.applicant.nationality);

  const day = kstDate(data.submittedAt);
  const row: Row = {
    id,
    name: buildFullName(data.applicant),
    phone,
    pool: "activation_request",
    status: "new",
    signup_date: day,
    application_date: day,
    requested_plan: data.product.name,
    monthly_fee: data.product.monthlyFee,
    customer_type: data.product.type,
    country_id: countryId,
    assigned_to: null,
    call_round: null,
    notes: buildNotes(data, encodeMarker(expected)),
    created_at: new Date().toISOString(),
  };

  const { error } = db.insert(row);
  if (error?.code === "23505") {
    const raced = db.selectById(id);
    if (raced) return replayOrConflict(raced);
    return { status: 409, body: { error: "customer_duplicate" } };
  }
  return { status: 201, body: { result: "created", applicationId: id, status: "received" } };
}

/** Mirrors the GET handler. */
async function get(
  db: Db,
  opts: { apiKey: string; keySpec: string; externalApplicationId: string }
): Promise<Result> {
  const partnerId = resolvePartnerId(opts.keySpec, opts.apiKey);
  if (!partnerId) return { status: 401, body: { error: "unauthorized" } };
  const id = await deriveCustomerId(partnerId, opts.externalApplicationId);
  const row = db.selectById(id);
  if (!row || !markerScopeMatches(parseMarker(row.notes), partnerId, opts.externalApplicationId)) {
    return { status: 404, body: { error: "not_found" } };
  }
  return {
    status: 200,
    body: {
      applicationId: row.id,
      externalApplicationId: opts.externalApplicationId,
      status: mapCustomerStatus(row.status),
      receivedAt: row.created_at,
    },
  };
}

/* ------------------------------ fixtures -------------------------------- */

const EXT_1 = "6f1c9d40-6b9e-4a2f-8f3e-1a2b3c4d5e6f";
const EXT_2 = "9b2d7e51-2c3a-4d5b-9e7f-0a1b2c3d4e5f";
const KEYS = "nh:KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK,nh:RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR,hp:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

const base = (over: Record<string, unknown> = {}): ApplicationRequest =>
  applicationRequestSchema.parse({
    externalApplicationId: EXT_1,
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
    ...over,
  });

/* -------------------------------- tests --------------------------------- */

describe("append-only intake (mock)", () => {
  it("creates exactly one customer row and writes nothing else", async () => {
    const db = new Db();
    const r = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    expect(r.status).toBe(201);
    expect(db.rows.length).toBe(1);
    expect(db.ops.filter((o) => o === "insert").length).toBe(1);
    const row = db.rows[0];
    expect(row.pool).toBe("activation_request");
    expect(row.status).toBe("new");
    expect(row.assigned_to).toBeNull();
    expect(row.call_round).toBeNull();
    expect(row.requested_plan).toBe("SK Light 49");
    expect(row.customer_type).toBe("sim");
    expect(row.country_id).toBe("country-mn");
  });

  it("uses the Korean calendar date of submittedAt", async () => {
    const db = new Db();
    // 2026-09-21T16:30Z is already 2026-09-22 in Seoul.
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base({ submittedAt: "2026-09-21T16:30:00Z" }) });
    expect(db.rows[0].signup_date).toBe("2026-09-22");
    expect(db.rows[0].application_date).toBe("2026-09-22");
  });

  it("replays an identical resubmit without inserting again", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    const again = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    expect(again.status).toBe(200);
    expect(again.body.result).toBe("replayed");
    expect(db.rows.length).toBe(1);
  });

  it("collapses simultaneous submits via the PK collision path (simulation only)", async () => {
    const db = new Db();
    const req = base();
    const results = [] as Result[];
    for (let i = 0; i < 3; i++) {
      results.push(await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req }));
    }
    expect(results.filter((r) => r.status === 201).length).toBe(1);
    expect(results.filter((r) => r.body.result === "replayed").length).toBe(2);
    expect(db.rows.length).toBe(1);
  });

  it("rejects the same external id with a different body (409, nothing overwritten)", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    const notesBefore = db.rows[0].notes;
    const conflict = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base({ locale: "vi" }) });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe("marker_mismatch");
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].notes).toBe(notesBefore);
  });

  it("keeps the same derived id after an API key rotation", async () => {
    const db = new Db();
    const first = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    const rotated = await post(db, { apiKey: "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR", keySpec: KEYS, req: base() });
    expect(rotated.status).toBe(200);
    expect(rotated.body.applicationId).toBe(first.body.applicationId);
    expect(db.rows.length).toBe(1);
  });

  it("gives a different partner a different id for the same external id", async () => {
    const db = new Db();
    const nh = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    // A different applicant, so the pre-existing (name, phone, date) dedup
    // index is not what this test measures.
    const hp = await post(db, {
      apiKey: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
      keySpec: KEYS,
      req: base({
        applicant: { ...base().applicant, firstName: "Nara", lastName: "Tseren" },
      }),
    });
    expect(hp.status).toBe(201);
    expect(hp.body.applicationId).not.toBe(nh.body.applicationId);
    expect((await get(db, { apiKey: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", keySpec: KEYS, externalApplicationId: EXT_1 })).body
      .applicationId).toBe(hp.body.applicationId);
  });

  it("refuses instead of repairing when an operator edited the marker away", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    db.rows[0].notes = "직원이 직접 지운 메모";
    const again = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("marker_mismatch");
    expect(db.rows[0].notes).toBe("직원이 직접 지운 메모"); // never rewritten
    const lookup = await get(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, externalApplicationId: EXT_1 });
    expect(lookup.status).toBe(404);
  });

  it("returns 409 customer_duplicate on an unrelated dedup collision and links nobody", async () => {
    const db = new Db();
    db.rows.push({
      id: "pre-existing-row",
      name: "Erdene Bat",
      phone: "010-1234-5678",
      pool: "activation_request",
      status: "activated",
      signup_date: "2026-09-21",
      application_date: "2026-09-21",
      requested_plan: null,
      monthly_fee: null,
      customer_type: null,
      country_id: null,
      assigned_to: "staff-1",
      call_round: null,
      notes: "기존 고객 메모",
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("customer_duplicate");
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].id).toBe("pre-existing-row");
    expect(db.rows[0].notes).toBe("기존 고객 메모"); // untouched
    expect(db.rows[0].status).toBe("activated");
  });

  it("never returns another partner's row from GET", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    expect((await get(db, { apiKey: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", keySpec: KEYS, externalApplicationId: EXT_1 })).status).toBe(404);
    expect((await get(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, externalApplicationId: EXT_2 })).status).toBe(404);
  });

  it("returns only status and timestamps from GET", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    const r = await get(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, externalApplicationId: EXT_1 });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(
      ["applicationId", "externalApplicationId", "receivedAt", "status"].sort()
    );
    expect(r.body.status).toBe("received");
  });

  it("requires the idempotency key to equal the external application id", async () => {
    const db = new Db();
    const r = await post(db, {
      apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
      keySpec: KEYS,
      idempotencyKey: "some-other-key",
      req: base(),
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("idempotency_key_mismatch");
    expect(db.rows.length).toBe(0);
  });

  it("stores a bundle with undecided carrier/fee and a genuinely free device", async () => {
    const db = new Db();
    const req = base({
      externalApplicationId: EXT_2,
      product: {
        code: "bundle-a175",
        type: "bundle",
        name: "Bundle A17 5G",
        carrier: null,
        monthlyFee: null,
        deviceModel: "Galaxy A17 5G",
        devicePrice: 0,
        contractMonths: 24,
        bundledPlanCode: null,
        currency: "KRW",
      },
    });
    const r = await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req });
    expect(r.status).toBe(201);
    const row = db.rows[0];
    expect(row.monthly_fee).toBeNull();
    expect(row.customer_type).toBe("bundle");
    expect(row.notes).toContain("0원 (무료)");
    expect(row.notes).toContain("통신사 미정");
    expect(row.notes).toContain("월요금 미정");
  });

  it("leaves country_id null for the ZZ nationality instead of guessing", async () => {
    const db = new Db();
    const req = base({
      applicant: { ...base().applicant, nationality: UNKNOWN_NATIONALITY },
    });
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req });
    expect(db.rows[0].country_id).toBeNull();
    expect(db.rows[0].notes).toContain("국적 ZZ");
  });

  it("shows plan name, language and source to operators in notes", async () => {
    const db = new Db();
    await post(db, { apiKey: "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", keySpec: KEYS, req: base() });
    const notes = db.rows[0].notes!;
    expect(notes.split("\n")[0].startsWith("HANPASS_PARTNER_V1:")).toBe(true);
    expect(notes).toContain("몽골어");
    expect(notes).toContain("NH 올원");
    expect(notes).toContain("SK Light 49");
  });
});
