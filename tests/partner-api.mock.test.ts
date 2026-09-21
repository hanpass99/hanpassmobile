/**
 * Mock-based integration tests for the intake semantics.
 *
 * IMPORTANT: this is a JavaScript in-memory simulation of the intended RPC
 * behaviour. It does NOT exercise PostgreSQL, unique indexes, transactions or
 * real concurrency, and must not be read as proof of database-level
 * correctness. Real concurrency behaviour can only be verified once an
 * independent test database exists and the draft SQL is applied there.
 */
import { describe, expect, it } from "bun:test";
import {
  applicationRequestSchema,
  buildApplicantSnapshot,
  buildFullName,
  buildProductSnapshot,
  normalizeNameKey,
  normalizePhone,
  requestHash,
  type ApplicationRequest,
} from "../src/lib/partner-api";

/* ---------------- in-memory stand-in for the RPC ------------------- */

type Customer = { id: string; name: string; phone: string; pool: string; status: string };
type App = {
  id: string;
  partnerId: string;
  externalApplicationId: string;
  idempotencyKey: string;
  requestHash: string;
  customerId: string | null;
  linkMode: "created" | "linked" | "unlinked_needs_review";
  applicantSnapshot: ReturnType<typeof buildApplicantSnapshot>;
  productSnapshot: unknown;
  status: string;
  reviewReason: string | null;
  assignedToPolicy: null;
  receivedAt: string;
};

class MockStore {
  customers: Customer[] = [];
  apps: App[] = [];
  private seq = 0;
  private id() {
    return `id-${++this.seq}`;
  }

  submit(partnerId: string, idempotencyKey: string, req: ApplicationRequest, hash: string) {
    const byKey = this.apps.find(
      (a) => a.partnerId === partnerId && a.idempotencyKey === idempotencyKey
    );
    if (byKey) {
      return byKey.requestHash === hash
        ? { outcome: "replayed" as const, app: byKey }
        : { outcome: "conflict" as const, reason: "idempotency_key_conflict" };
    }
    const byExt = this.apps.find(
      (a) => a.partnerId === partnerId && a.externalApplicationId === req.externalApplicationId
    );
    if (byExt) {
      return byExt.requestHash === hash
        ? { outcome: "replayed" as const, app: byExt }
        : { outcome: "conflict" as const, reason: "external_application_id_conflict" };
    }

    const phone = normalizePhone(req.applicant.phone)!;
    const name = normalizeNameKey(buildFullName(req.applicant));
    // Existing customers are normalized on the stored side too, so a row saved
    // as +82 10 ... still compares equal to an incoming 010-... number.
    const samePhone = this.customers.filter(
      (c) => c.pool === "activation_request" && normalizePhone(c.phone) === phone
    );
    const matches = samePhone.filter((c) => normalizeNameKey(c.name) === name);

    let customerId: string | null;
    let linkMode: App["linkMode"];
    let status = "received";
    let reviewReason: string | null = null;
    if (matches.length === 1) {
      customerId = matches[0].id;
      linkMode = "linked";
    } else if (matches.length > 1) {
      customerId = null;
      linkMode = "unlinked_needs_review";
      status = "needs_review";
      reviewReason = "multiple_customer_matches";
    } else if (samePhone.length > 0) {
      // Same number, different name: never merge, never create a second person.
      customerId = null;
      linkMode = "unlinked_needs_review";
      status = "needs_review";
      reviewReason = "phone_match_name_mismatch";
    } else {
      const c: Customer = {
        id: this.id(),
        name: buildFullName(req.applicant),
        phone,
        pool: "activation_request",
        status: "new",
      };
      this.customers.push(c);
      customerId = c.id;
      linkMode = "created";
    }

    const app: App = {
      id: this.id(),
      partnerId,
      externalApplicationId: req.externalApplicationId,
      idempotencyKey,
      requestHash: hash,
      customerId,
      linkMode,
      applicantSnapshot: buildApplicantSnapshot(req, phone),
      productSnapshot: buildProductSnapshot(req),
      status,
      reviewReason,
      assignedToPolicy: null,
      receivedAt: new Date().toISOString(),
    };
    this.apps.push(app);
    return { outcome: "created" as const, app };
  }

  get(partnerId: string, externalApplicationId: string) {
    return (
      this.apps.find(
        (a) => a.partnerId === partnerId && a.externalApplicationId === externalApplicationId
      ) ?? null
    );
  }
}

const base = (over: Record<string, unknown> = {}): ApplicationRequest =>
  applicationRequestSchema.parse({
    externalApplicationId: "hp-0001",
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

const submit = async (s: MockStore, key: string, req: ApplicationRequest, partner = "nh") =>
  s.submit(partner, key, req, await requestHash(req));

/* ---------------------------- tests -------------------------------- */

describe("intake semantics (mock)", () => {
  it("creates a customer and an application on first submit", async () => {
    const s = new MockStore();
    const r = await submit(s, "k1", base());
    expect(r.outcome).toBe("created");
    expect(s.customers.length).toBe(1);
    expect(s.apps.length).toBe(1);
    expect(s.apps[0].linkMode).toBe("created");
  });

  it("replays the same key with the same body", async () => {
    const s = new MockStore();
    const first = await submit(s, "k1", base());
    const again = await submit(s, "k1", base());
    expect(again.outcome).toBe("replayed");
    expect((again as any).app.id).toBe((first as any).app.id);
    expect(s.apps.length).toBe(1);
  });

  it("rejects the same key with a different body (409)", async () => {
    const s = new MockStore();
    await submit(s, "k1", base());
    const conflict = await submit(
      s,
      "k1",
      base({ product: { ...base().product, code: "lg-hanpass7", name: "LG Hanpass 7" } })
    );
    expect(conflict.outcome).toBe("conflict");
    expect((conflict as any).reason).toBe("idempotency_key_conflict");
  });

  it("rejects a reused externalApplicationId with different content", async () => {
    const s = new MockStore();
    await submit(s, "k1", base());
    const conflict = await submit(s, "k2", base({ locale: "vi" }));
    expect(conflict.outcome).toBe("conflict");
    expect((conflict as any).reason).toBe("external_application_id_conflict");
  });

  it("keeps a second, different product application as its own row", async () => {
    const s = new MockStore();
    await submit(s, "k1", base());
    const second = await submit(
      s,
      "k2",
      base({
        externalApplicationId: "hp-0002",
        product: {
          code: "bundle-a175",
          type: "bundle",
          name: "Bundle A17 5G",
          carrier: "LGU+",
          monthlyFee: 33000,
          deviceModel: "Galaxy A17 5G",
          devicePrice: 0,
          contractMonths: 24,
          bundledPlanCode: "lg-hanpass7",
          currency: "KRW",
        },
      })
    );
    expect(second.outcome).toBe("created");
    expect(s.apps.length).toBe(2);
    expect(s.customers.length).toBe(1); // linked, not duplicated
    expect(s.apps[1].linkMode).toBe("linked");
    expect((s.apps[1].productSnapshot as any).devicePrice).toBe(0);
  });

  it("sends a same-number/different-name application to needs_review instead of creating a customer", async () => {
    const s = new MockStore();
    await submit(s, "k1", base());
    const other = await submit(
      s,
      "k2",
      base({
        externalApplicationId: "hp-0003",
        applicant: {
          firstName: "Nara",
          middleName: null,
          lastName: "Tseren",
          phone: "010-1234-5678",
          nationality: "MN",
        },
      })
    );
    expect(other.outcome).toBe("created");
    expect(s.customers.length).toBe(1); // no second person on the same number
    expect(s.apps[1].customerId).toBeNull();
    expect(s.apps[1].linkMode).toBe("unlinked_needs_review");
    expect(s.apps[1].status).toBe("needs_review");
    expect(s.apps[1].reviewReason).toBe("phone_match_name_mismatch");
  });

  it("matches an existing customer stored in +82 form through normalization", async () => {
    const s = new MockStore();
    s.customers.push({
      id: "c5",
      name: "Erdene Bat",
      phone: "+82 10 1234 5678",
      pool: "activation_request",
      status: "new",
    });
    const r = await submit(s, "k1", base());
    expect((r as any).app.linkMode).toBe("linked");
    expect((r as any).app.customerId).toBe("c5");
    expect(s.customers.length).toBe(1);
  });

  it("preserves the applicant snapshot when nothing is linked", async () => {
    const s = new MockStore();
    s.customers.push(
      { id: "c1", name: "Erdene Bat", phone: "010-1234-5678", pool: "activation_request", status: "new" },
      { id: "c2", name: "Erdene Bat", phone: "010-1234-5678", pool: "activation_request", status: "new" }
    );
    const r = await submit(s, "k1", base());
    const app = (r as any).app;
    expect(app.customerId).toBeNull();
    expect(app.applicantSnapshot.fullName).toBe("Erdene Bat");
    expect(app.applicantSnapshot.phone).toBe("010-1234-5678");
    expect(app.applicantSnapshot.nationality).toBe("MN");
  });

  it("flags needs_review instead of guessing when several customers match", async () => {
    const s = new MockStore();
    s.customers.push(
      { id: "c1", name: "Erdene Bat", phone: "010-1234-5678", pool: "activation_request", status: "activated" },
      { id: "c2", name: "Erdene Bat", phone: "010-1234-5678", pool: "activation_request", status: "new" }
    );
    const r = await submit(s, "k1", base());
    expect(r.outcome).toBe("created");
    expect((r as any).app.linkMode).toBe("unlinked_needs_review");
    expect((r as any).app.status).toBe("needs_review");
  });

  it("never reports the linked customer's old status as the new application status", async () => {
    const s = new MockStore();
    s.customers.push({
      id: "c9",
      name: "Erdene Bat",
      phone: "010-1234-5678",
      pool: "activation_request",
      status: "activated",
    });
    const r = await submit(s, "k1", base());
    expect((r as any).app.linkMode).toBe("linked");
    expect((r as any).app.status).toBe("received");
    expect(s.customers[0].status).toBe("activated"); // untouched
  });

  it("leaves assignment to operators (no auto-assignment)", async () => {
    const s = new MockStore();
    const r = await submit(s, "k1", base());
    expect((r as any).app.assignedToPolicy).toBeNull();
  });

  it("scopes lookups to the calling partner", async () => {
    const s = new MockStore();
    await submit(s, "k1", base(), "nh");
    expect(s.get("nh", "hp-0001")).not.toBeNull();
    expect(s.get("hp", "hp-0001")).toBeNull();
  });

  it(
    "collapses simultaneous identical submits to one row (simulation only, not a PostgreSQL concurrency proof)",
    async () => {
      const s = new MockStore();
      const req = base();
      const hash = await requestHash(req);
      const results = [
        s.submit("nh", "k1", req, hash),
        s.submit("nh", "k1", req, hash),
        s.submit("nh", "k1", req, hash),
      ];
      expect(results.filter((r) => r.outcome === "created").length).toBe(1);
      expect(results.filter((r) => r.outcome === "replayed").length).toBe(2);
      expect(s.apps.length).toBe(1);
    }
  );
});
