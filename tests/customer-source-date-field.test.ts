import { expect, test } from "bun:test";
import { filterSourceRows, type SourceFilterParams } from "../src/lib/customer-source";

const ROWS = [
  {
    id: "a",
    name: "A",
    phone: "0101",
    status: "new",
    imported_at: "2026-10-05T00:00:00.000Z",
    status_changed_at: "2026-11-02T00:00:00.000Z",
  },
  {
    id: "b",
    name: "B",
    phone: "0102",
    status: "new",
    imported_at: "2026-11-02T00:00:00.000Z",
    status_changed_at: "2026-10-05T00:00:00.000Z",
  },
];

const PERIOD: SourceFilterParams = {
  dateFromIso: "2026-11-01T00:00:00.000Z",
  dateToIso: "2026-11-30T23:59:59.000Z",
};

const idsFor = (dateField: SourceFilterParams["dateField"]) =>
  filterSourceRows(ROWS, { ...PERIOD, dateField }, [], null, false).map((r) => r.id);

test("화면 유입 조회도 기간 기준 3가지를 DB와 같은 규칙으로 적용", () => {
  expect(idsFor("imported_at")).toEqual(["b"]);
  expect(idsFor("status_changed_at")).toEqual(["a"]);
  expect(idsFor("both")).toEqual(["a", "b"]);
  expect(idsFor(undefined)).toEqual(["b"]);
});
