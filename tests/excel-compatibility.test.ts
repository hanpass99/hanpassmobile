import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";

describe("existing Excel import/export compatibility", () => {
  for (const bookType of ["xlsx", "biff8", "csv"] as const) {
    it(`round trips customer fields through ${bookType}`, () => {
      const rows = [{ "고객명": "Fixture", "국적": "UZ", "개통번호": "01012345678", "개통일": "2026-10-18" }];
      const header = ["고객명", "국적", "개통번호", "개통일"];
      const sheet = XLSX.utils.json_to_sheet(rows, { header });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Customers");
      const bytes = XLSX.write(book, { type: "array", bookType });
      const restored = XLSX.read(bytes, { type: "array", cellDates: true });
      const result = XLSX.utils.sheet_to_json(restored.Sheets[restored.SheetNames[0]], { defval: "", raw: true });
      if (bookType === "csv") {
        // Existing CSV auto-detection emits numeric phones and Date cells;
        // customer import already normalizes these representations.
        expect(result).toEqual([{ ...rows[0], "개통번호": 1012345678, "개통일": new Date("2026-10-18T00:00:00Z") }]);
      } else expect(result).toEqual(rows);
    });
  }
  it("preserves dates and blank optional import fields", () => {
    const date = new Date("2026-10-18T00:00:00Z");
    const sheet = XLSX.utils.json_to_sheet([{ name: "Fixture", date, optional: "" }]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Customers");
    const restored = XLSX.read(XLSX.write(book, { type: "array", bookType: "xlsx" }), { type: "array", cellDates: true });
    const rows = XLSX.utils.sheet_to_json<{ date: Date; optional: string }>(restored.Sheets.Customers, { defval: "", raw: true });
    expect(rows[0].date.toISOString()).toBe(date.toISOString());
    expect(rows[0].optional).toBe("");
  });
  it("loads the official fixed SheetJS release", () => expect(XLSX.version).toBe("0.20.3"));
});