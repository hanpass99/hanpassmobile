import { describe, expect, it } from "bun:test";
import { isApprovedStaff, staffBanDuration } from "../src/lib/staff-security";

describe("staff approval", () => {
  it("keeps active approved staff authorized", () => expect(isApprovedStaff({ approval_status: "approved", is_active: true })).toBe(true));
  it("rejects pending even if active", () => expect(isApprovedStaff({ approval_status: "pending", is_active: true })).toBe(false));
  it("rejects approved but disabled", () => expect(isApprovedStaff({ approval_status: "approved", is_active: false })).toBe(false));
  it("rejects disabled status even if active", () => expect(isApprovedStaff({ approval_status: "disabled", is_active: true })).toBe(false));
  it("fails closed without a profile", () => expect(isApprovedStaff(null)).toBe(false));
  it("bans disabled accounts", () => expect(staffBanDuration(false)).toBe("876000h"));
  it("unbans reactivated accounts", () => expect(staffBanDuration(true)).toBe("none"));
});