import type { VisitPersonKind } from "./types";

type VisitBookParticipationRow<TitleId> = {
  titleId: TitleId;
  donatedQuantity: number;
  readAloud: boolean;
};

export function titleParticipation<TitleId>(
  rows: VisitBookParticipationRow<TitleId>[],
  titleId: TitleId,
) {
  return rows.reduce(
    (participation, row) =>
      row.titleId === titleId
        ? {
            readAloudCount:
              participation.readAloudCount + Number(row.readAloud),
            donatedQuantity:
              participation.donatedQuantity + row.donatedQuantity,
          }
        : participation,
    { readAloudCount: 0, donatedQuantity: 0 },
  );
}

type VisitPersonParticipationRow<PersonId> = {
  personId: PersonId;
  kind: VisitPersonKind;
};

export function personParticipation<PersonId>(
  rows: VisitPersonParticipationRow<PersonId>[],
  personId: PersonId,
) {
  return rows.reduce(
    (participation, row) => {
      if (row.personId !== personId) {
        return participation;
      }
      switch (row.kind) {
        case "reader":
          return {
            ...participation,
            readerVisitCount: participation.readerVisitCount + 1,
          };
        case "staff":
          return {
            ...participation,
            staffVisitCount: participation.staffVisitCount + 1,
          };
        default: {
          const unhandledKind: never = row.kind;
          throw new Error(`Unhandled visit person kind: ${unhandledKind}`);
        }
      }
    },
    { readerVisitCount: 0, staffVisitCount: 0 },
  );
}
