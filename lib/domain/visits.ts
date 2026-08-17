import type { ConsumptionStatus, VisitPersonKind } from "./types";

export type VisitReservationCandidate<ReservationId = string> = {
  reservationId: ReservationId;
  quantity: number;
};

export type VisitReservationMatch<ReservationId = string> =
  | {
      consumptionStatus: Exclude<ConsumptionStatus, "consumed">;
      consumedQuantity: 0;
      reservationId?: never;
    }
  | {
      consumptionStatus: "consumed";
      consumedQuantity: number;
      reservationId: ReservationId;
    };

export function matchVisitReservation<ReservationId>(
  candidates: VisitReservationCandidate<ReservationId>[],
  donatedQuantity: number,
): VisitReservationMatch<ReservationId> {
  if (candidates.length === 0) {
    return { consumptionStatus: "none", consumedQuantity: 0 };
  }
  if (candidates.length > 1) {
    return { consumptionStatus: "ambiguous", consumedQuantity: 0 };
  }
  const [candidate] = candidates;
  return {
    consumptionStatus: "consumed",
    reservationId: candidate.reservationId,
    consumedQuantity: Math.min(donatedQuantity, candidate.quantity),
  };
}

export function donationSourceId(
  visitId: string,
  titleId: string,
  generation: number,
) {
  return `donation:${visitId}:${titleId}:${generation}`;
}

export function reservationConsumptionSourceId(
  visitId: string,
  reservationId: string,
  generation: number,
) {
  return `reservationConsumption:${visitId}:${reservationId}:${generation}`;
}

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
