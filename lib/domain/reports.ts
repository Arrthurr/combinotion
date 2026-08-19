import { csv } from "@/lib/exports/csv";

export const POPULARITY_COLUMNS = [
  { key: "title", label: "Title", defaultDirection: "asc" },
  { key: "author", label: "Author", defaultDirection: "asc" },
  { key: "requestCount", label: "Requests", defaultDirection: "desc" },
  {
    key: "donatedQuantity",
    label: "Donated copies",
    defaultDirection: "desc",
  },
  {
    key: "averageScore",
    label: "Average rubric score",
    defaultDirection: "desc",
  },
] as const;

export type PopularityColumnKey = (typeof POPULARITY_COLUMNS)[number]["key"];
export type SortDirection = "asc" | "desc";

export type PopularityRow<TitleId = string> = {
  titleId: TitleId;
  title: string;
  author: string;
  requestCount: number;
  donatedQuantity: number;
  averageScore: number | null;
};

export type PopularityInputs<TitleId = string, RequestId = string> = {
  titles: ReadonlyArray<{
    titleId: TitleId;
    title: string;
    author: string;
  }>;
  reservations: ReadonlyArray<{
    titleId: TitleId;
    schoolRequestId: RequestId;
  }>;
  visitBooks: ReadonlyArray<{
    titleId: TitleId;
    donatedQuantity: number;
  }>;
  reviews: ReadonlyArray<{
    titleId: TitleId;
    score: number;
  }>;
};

export type PopularitySort = {
  column: PopularityColumnKey;
  direction: SortDirection;
};

export type PopularityFilter = {
  text?: string;
  min?: {
    requestCount?: number;
    donatedQuantity?: number;
    averageScore?: number;
  };
};

export type PopularityView = {
  sort: PopularitySort;
  filter: PopularityFilter;
};

type PopularityAccumulator<TitleId> = PopularityRow<TitleId> & {
  reviewScoreTotal: number;
  reviewScoreCount: number;
};

export function derivePopularity<TitleId, RequestId>(
  inputs: PopularityInputs<TitleId, RequestId>,
): PopularityRow<TitleId>[] {
  const rows = new Map<TitleId, PopularityAccumulator<TitleId>>();
  const requestIdsByTitle = new Map<TitleId, Set<RequestId>>();

  for (const title of inputs.titles) {
    rows.set(title.titleId, {
      ...title,
      requestCount: 0,
      donatedQuantity: 0,
      averageScore: null,
      reviewScoreTotal: 0,
      reviewScoreCount: 0,
    });
  }

  for (const reservation of inputs.reservations) {
    const row = rows.get(reservation.titleId);
    if (!row) {
      continue;
    }
    const requestIds =
      requestIdsByTitle.get(reservation.titleId) ?? new Set<RequestId>();
    if (!requestIds.has(reservation.schoolRequestId)) {
      requestIds.add(reservation.schoolRequestId);
      row.requestCount += 1;
    }
    requestIdsByTitle.set(reservation.titleId, requestIds);
  }

  for (const visitBook of inputs.visitBooks) {
    const row = rows.get(visitBook.titleId);
    if (row) {
      row.donatedQuantity += visitBook.donatedQuantity;
    }
  }

  for (const review of inputs.reviews) {
    const row = rows.get(review.titleId);
    if (row) {
      row.reviewScoreTotal += review.score;
      row.reviewScoreCount += 1;
    }
  }

  return [...rows.values()]
    .map(
      ({
        reviewScoreTotal,
        reviewScoreCount,
        ...row
      }): PopularityRow<TitleId> => ({
        ...row,
        averageScore:
          reviewScoreCount === 0
            ? null
            : reviewScoreTotal / reviewScoreCount,
      }),
    )
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.author.localeCompare(right.author),
    );
}

export const buildPopularityRows = derivePopularity;

function matchesFilter<TitleId>(
  row: PopularityRow<TitleId>,
  filter: PopularityFilter,
) {
  const text = filter.text?.trim().toLocaleLowerCase();
  if (
    text &&
    !row.title.toLocaleLowerCase().includes(text) &&
    !row.author.toLocaleLowerCase().includes(text)
  ) {
    return false;
  }
  if (
    filter.min?.requestCount !== undefined &&
    row.requestCount < filter.min.requestCount
  ) {
    return false;
  }
  if (
    filter.min?.donatedQuantity !== undefined &&
    row.donatedQuantity < filter.min.donatedQuantity
  ) {
    return false;
  }
  if (
    filter.min?.averageScore !== undefined &&
    (row.averageScore === null ||
      row.averageScore < filter.min.averageScore)
  ) {
    return false;
  }
  return true;
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: SortDirection,
) {
  if (left === null) {
    return right === null ? 0 : 1;
  }
  if (right === null) {
    return -1;
  }
  return direction === "asc" ? left - right : right - left;
}

function compareRows<TitleId>(
  left: PopularityRow<TitleId>,
  right: PopularityRow<TitleId>,
  sort: PopularitySort,
) {
  let result: number;
  switch (sort.column) {
    case "title":
      result = left.title.localeCompare(right.title);
      break;
    case "author":
      result = left.author.localeCompare(right.author);
      break;
    case "requestCount":
      result = left.requestCount - right.requestCount;
      break;
    case "donatedQuantity":
      result = left.donatedQuantity - right.donatedQuantity;
      break;
    case "averageScore":
      result = compareNullableNumbers(
        left.averageScore,
        right.averageScore,
        sort.direction,
      );
      return (
        result ||
        left.title.localeCompare(right.title) ||
        left.author.localeCompare(right.author)
      );
    default: {
      const exhaustive: never = sort.column;
      return exhaustive;
    }
  }

  const directed = sort.direction === "asc" ? result : -result;
  return (
    directed ||
    left.title.localeCompare(right.title) ||
    left.author.localeCompare(right.author)
  );
}

export function visiblePopularityRows<TitleId>(
  rows: ReadonlyArray<PopularityRow<TitleId>>,
  view: PopularityView,
): PopularityRow<TitleId>[] {
  return rows
    .filter((row) => matchesFilter(row, view.filter))
    .sort((left, right) => compareRows(left, right, view.sort));
}

export function formatAverageScore(score: number | null) {
  return score === null ? "" : String(Number(score.toFixed(1)));
}

export function popularityCsv<TitleId>(
  rows: ReadonlyArray<PopularityRow<TitleId>>,
) {
  return csv(
    POPULARITY_COLUMNS.map((column) => column.label),
    rows.map((row) => [
      row.title,
      row.author,
      row.requestCount,
      row.donatedQuantity,
      formatAverageScore(row.averageScore),
    ]),
  );
}
