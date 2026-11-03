import { describe, expect, it } from "vitest";
import { filterSourceRows, getCustomerSource } from "./customer-source";

describe("getCustomerSource", () => {
  it("NH 올원 메모는 농협 유입", () => {
    expect(getCustomerSource("메모\n[파트너 신청] NH 올원 / 요금제 A")).toBe("nh_allone");
  });
  it("한패스 웹 메모는 한패스 웹 유입", () => {
    expect(getCustomerSource("[파트너 신청] 한패스 웹")).toBe("hanpass_web");
  });
  it("표시 없는 메모는 분류 없음", () => {
    expect(getCustomerSource("일반 메모")).toBeNull();
    expect(getCustomerSource(null)).toBeNull();
  });
});

describe("filterSourceRows", () => {
  const rows = [
    { id: "a", name: "Kim", phone: "010", status: "new", imported_at: "2026-10-05T00:00:00Z", assigned_to: "s1" },
    { id: "b", name: "Lee", phone: "011", status: "activated", imported_at: "2026-10-20T00:00:00Z", assigned_to: null },
  ];
  const staff = [{ id: "s1", display_name: "홍길동", country_id: "c1" }];
  it("담당자 이름 검색과 상태 필터를 기존 규칙대로 적용", () => {
    expect(filterSourceRows(rows, { search: "홍길" }, staff, null, true).map((r) => r.id)).toEqual(["a"]);
    expect(filterSourceRows(rows, { status: "activated" }, staff, null, true).map((r) => r.id)).toEqual(["b"]);
    expect(filterSourceRows(rows, { status: "activated" }, staff, null, false)).toHaveLength(2);
  });
});
