import { describe, expect, it } from "bun:test";
import { canViewOneYearActivation, isApprovedStaff, staffBanDuration } from "../src/lib/staff-security";

describe("staff approval", () => {
  it("shows one-year activation to Hanpass Mobile staff and administrators", () => expect(canViewOneYearActivation("한패스 모바일")).toBe(true));
  it("hides one-year activation from Hanpass company users", () => expect(canViewOneYearActivation("한패스")).toBe(false));
  it("hides one-year activation until company is known", () => expect(canViewOneYearActivation("")).toBe(false));
  it("keeps active approved staff authorized", () => expect(isApprovedStaff({ approval_status: "approved", is_active: true })).toBe(true));
  it("rejects pending even if active", () => expect(isApprovedStaff({ approval_status: "pending", is_active: true })).toBe(false));
  it("rejects approved but disabled", () => expect(isApprovedStaff({ approval_status: "approved", is_active: false })).toBe(false));
  it("rejects disabled status even if active", () => expect(isApprovedStaff({ approval_status: "disabled", is_active: true })).toBe(false));
  it("fails closed without a profile", () => expect(isApprovedStaff(null)).toBe(false));
  it("bans disabled accounts", () => expect(staffBanDuration(false)).toBe("876000h"));
  it("unbans reactivated accounts", () => expect(staffBanDuration(true)).toBe("none"));
});