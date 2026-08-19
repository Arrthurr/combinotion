import { query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { derivePopularity } from "../lib/domain/reports";

export const popularity = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const [titles, reservations, visitBooks, reviews] = await Promise.all([
      ctx.db.query("titles").collect(),
      ctx.db.query("reservations").collect(),
      ctx.db.query("visitBooks").collect(),
      ctx.db.query("reviews").collect(),
    ]);

    return derivePopularity({
      titles: titles.map((title) => ({
        titleId: title._id,
        title: title.title,
        author: title.author,
      })),
      reservations: reservations.map((reservation) => ({
        titleId: reservation.titleId,
        schoolRequestId: reservation.schoolRequestId,
      })),
      visitBooks: visitBooks.map((book) => ({
        titleId: book.titleId,
        donatedQuantity: book.donatedQuantity,
      })),
      reviews: reviews.map((review) => ({
        titleId: review.titleId,
        score: review.score,
      })),
    });
  },
});
