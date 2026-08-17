import { describe, expect, it } from "vitest";
import {
  personParticipation,
  titleParticipation,
} from "../lib/domain/visits";

describe("visit participation", () => {
  it("derives title read and donation totals from visit books", () => {
    const rows = [
      { titleId: "title-1", donatedQuantity: 20, readAloud: true },
      { titleId: "title-1", donatedQuantity: 10, readAloud: false },
      { titleId: "title-2", donatedQuantity: 3, readAloud: true },
    ];

    expect(titleParticipation(rows, "title-1")).toEqual({
      readAloudCount: 1,
      donatedQuantity: 30,
    });
    expect(titleParticipation(rows, "missing")).toEqual({
      readAloudCount: 0,
      donatedQuantity: 0,
    });
  });

  it("derives reader and staff visit counts independently", () => {
    const rows = [
      { personId: "person-1", kind: "reader" as const },
      { personId: "person-1", kind: "staff" as const },
      { personId: "person-1", kind: "reader" as const },
      { personId: "person-2", kind: "reader" as const },
    ];

    expect(personParticipation(rows, "person-1")).toEqual({
      readerVisitCount: 2,
      staffVisitCount: 1,
    });
    expect(personParticipation(rows, "missing")).toEqual({
      readerVisitCount: 0,
      staffVisitCount: 0,
    });
  });
});
