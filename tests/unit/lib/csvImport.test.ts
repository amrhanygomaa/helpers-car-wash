import { describe, it, expect } from "vitest";
import { parseCsv } from "../../../src/lib/csvImport";

describe("parseCsv", () => {
  it("returns an empty array for empty or whitespace-only input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("   \n  \r\n ")).toEqual([]);
  });

  it("parses a simple comma-separated grid", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("captures the final row even without a trailing newline", () => {
    expect(parseCsv("name,qty\nصنف,5")).toEqual([
      ["name", "qty"],
      ["صنف", "5"],
    ]);
  });

  it("normalizes CRLF and lone CR line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("preserves empty fields between commas", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });

  it("skips blank lines but keeps rows that have any non-empty cell", () => {
    expect(parseCsv("a,b\n\n , \nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps commas and newlines inside quoted fields", () => {
    expect(parseCsv('"Cairo, EG","line1\nline2"')).toEqual([
      ["Cairo, EG", "line1\nline2"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('"say ""hi""",plain')).toEqual([['say "hi"', "plain"]]);
  });

  it("handles a quoted field followed by more cells", () => {
    expect(parseCsv('"a,b",c,d\n"x","y"')).toEqual([
      ["a,b", "c", "d"],
      ["x", "y"],
    ]);
  });
});
