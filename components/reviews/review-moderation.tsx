"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function ReviewModerationFallback() {
  return (
    <section
      className="card stack"
      aria-labelledby="review-moderation-heading"
    >
      <h2 id="review-moderation-heading">Review moderation</h2>
      <p>
        Approve feedback for Squarespace without changing the rubric score.
      </p>
      <button className="button" disabled>
        Approve review
      </button>
      <p className="muted" role="status">
        Connect Convex to moderate reviews.
      </p>
    </section>
  );
}

export function ReviewModeration() {
  if (!convexConfigured) {
    return <ReviewModerationFallback />;
  }
  return <ReviewModerationLive />;
}

function ReviewModerationLive() {
  const reviews = useQuery(api.reviews.list);
  const setApproved = useMutation(api.reviews.setApproved);
  const [busyReviewId, setBusyReviewId] = useState<Id<"reviews"> | null>(
    null,
  );
  const [status, setStatus] = useState("");

  async function toggleApproval(
    reviewId: Id<"reviews">,
    approved: boolean,
    title: string,
  ) {
    if (busyReviewId !== null) {
      return;
    }
    setBusyReviewId(reviewId);
    setStatus(approved ? `Excluding ${title}…` : `Approving ${title}…`);
    try {
      await setApproved({ reviewId, approved: !approved });
      setStatus(
        approved
          ? `${title} feedback excluded.`
          : `${title} feedback approved for Squarespace.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not update review.",
      );
    } finally {
      setBusyReviewId(null);
    }
  }

  return (
    <section
      className="card stack"
      aria-labelledby="review-moderation-heading"
    >
      <h2 id="review-moderation-heading">Review moderation</h2>
      <p>
        Approval controls Squarespace copy-paste only. Every rubric score
        remains in the popularity average.
      </p>
      {reviews === undefined ? (
        <p className="muted" role="status">
          Loading reviews…
        </p>
      ) : reviews.length === 0 ? (
        <p className="muted">No reviews to moderate.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {reviews.map((review) => (
            <li className="card stack" key={review.reviewId}>
              <div>
                <strong>{review.title}</strong>
                <p className="muted">
                  {review.reviewer}, rubric score {review.score}
                </p>
              </div>
              <p>{review.feedback}</p>
              <div className="row">
                <span>
                  {review.approved
                    ? "Approved for Squarespace"
                    : "Excluded from Squarespace"}
                </span>
                <button
                  className="button"
                  disabled={busyReviewId !== null}
                  type="button"
                  onClick={() =>
                    toggleApproval(
                      review.reviewId,
                      review.approved,
                      review.title,
                    )
                  }
                >
                  {review.approved ? "Exclude" : "Approve"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
