"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function splitColumns(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function optionalColumn(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

export function OperationsSettings() {
  if (!convexConfigured) {
    return (
      <section className="card stack" aria-labelledby="operations-settings-heading">
        <h2 id="operations-settings-heading">Operating controls</h2>
        <p className="muted" role="status">
          Connect Convex to change the threshold, public request hold, and Sheets feeds.
        </p>
      </section>
    );
  }
  return <OperationsSettingsLive />;
}

function OperationsSettingsLive() {
  const settings = useQuery(api.orgSettings.get);
  const feeds = useQuery(api.intake.listFeeds);
  const updateSettings = useMutation(api.orgSettings.update);
  const saveFeed = useMutation(api.intake.saveFeedConfig);
  const disableFeed = useMutation(api.intake.disableFeed);
  const verifyFeed = useAction(api.intake.verifyAndEnableFeed);
  const [status, setStatus] = useState("");

  if (settings === undefined || feeds === undefined) {
    return (
      <p className="muted" role="status">
        Loading operating controls…
      </p>
    );
  }

  const reviewFeed = feeds.find((feed) => feed.kind === "bookReviews");
  const donationFeed = feeds.find((feed) => feed.kind === "donationApplications");

  async function saveOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const open = data.get("publicRequests") === "open";
    setStatus("Saving operating controls…");
    try {
      await updateSettings({
        lowStockThreshold: Number(data.get("lowStockThreshold")),
        publicRequests: open
          ? { kind: "open" }
          : {
              kind: "paused",
              message: optionalColumn(data.get("pausedMessage")),
            },
      });
      setStatus("Operating controls saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    }
  }

  async function saveReviewFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("Saving book review feed…");
    try {
      await saveFeed({
        feedId: reviewFeed?._id,
        kind: "bookReviews",
        spreadsheetId: String(data.get("spreadsheetId") ?? ""),
        tabName: String(data.get("tabName") ?? ""),
        mapping: {
          identityColumns: splitColumns(data.get("identityColumns")),
          reviewerColumn: String(data.get("reviewerColumn") ?? ""),
          scoreColumn: String(data.get("scoreColumn") ?? ""),
          feedbackColumn: String(data.get("feedbackColumn") ?? ""),
          isbnColumn: optionalColumn(data.get("isbnColumn")),
          titleTextColumn: optionalColumn(data.get("titleTextColumn")),
        },
      });
      setStatus("Book review feed saved. Verify access before enabling.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save feed.");
    }
  }

  async function saveDonationFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("Saving donation application feed…");
    try {
      await saveFeed({
        feedId: donationFeed?._id,
        kind: "donationApplications",
        spreadsheetId: String(data.get("spreadsheetId") ?? ""),
        tabName: String(data.get("tabName") ?? ""),
        mapping: {
          identityColumns: splitColumns(data.get("identityColumns")),
          nameColumn: String(data.get("nameColumn") ?? ""),
          emailColumn: optionalColumn(data.get("emailColumn")),
          schoolNameColumn: optionalColumn(data.get("schoolNameColumn")),
          schoolAddressColumn: optionalColumn(data.get("schoolAddressColumn")),
          messageColumn: optionalColumn(data.get("messageColumn")),
        },
      });
      setStatus("Donation application feed saved. Verify access before enabling.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save feed.");
    }
  }

  async function enable(feedId: Id<"intakeFeeds">, label: string) {
    setStatus(`Checking ${label}…`);
    const result = await verifyFeed({ feedId });
    setStatus(
      result.kind === "enabled"
        ? `${label} is enabled.`
        : `${label} failed: ${result.message}`,
    );
  }

  async function disable(feedId: Id<"intakeFeeds">, label: string) {
    await disableFeed({ feedId });
    setStatus(`${label} is disabled.`);
  }

  return (
    <div className="stack">
      <form className="card stack" onSubmit={saveOrg}>
        <h2 id="operations-settings-heading">Operating controls</h2>
        <label>
          Low-stock threshold
          <input
            name="lowStockThreshold"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={settings?.lowStockThreshold ?? 15}
          />
        </label>
        <fieldset>
          <legend>Public book requests</legend>
          <label>
            <input
              name="publicRequests"
              type="radio"
              value="paused"
              defaultChecked={settings?.publicRequests.kind !== "open"}
            />
            Held closed
          </label>
          <label>
            <input
              name="publicRequests"
              type="radio"
              value="open"
              defaultChecked={settings?.publicRequests.kind === "open"}
            />
            Open
          </label>
          <label>
            Hold message
            <input
              name="pausedMessage"
              defaultValue={
                settings?.publicRequests.kind === "paused"
                  ? (settings.publicRequests.message ?? "")
                  : ""
              }
            />
          </label>
        </fieldset>
        <button className="button" type="submit">
          Save operating controls
        </button>
      </form>

      <form className="card stack" onSubmit={saveReviewFeed}>
        <h2>Book review sheet</h2>
        <FeedIdentityFields
          spreadsheetId={reviewFeed?.spreadsheetId}
          tabName={reviewFeed?.tabName}
          identityColumns={
            reviewFeed?.kind === "bookReviews"
              ? reviewFeed.mapping.identityColumns.join(", ")
              : "Timestamp, Email Address"
          }
        />
        <label>
          Reviewer column
          <input
            name="reviewerColumn"
            required
            defaultValue={
              reviewFeed?.kind === "bookReviews"
                ? reviewFeed.mapping.reviewerColumn
                : "Your name"
            }
          />
        </label>
        <label>
          Score column
          <input
            name="scoreColumn"
            required
            defaultValue={
              reviewFeed?.kind === "bookReviews"
                ? reviewFeed.mapping.scoreColumn
                : "Score"
            }
          />
        </label>
        <label>
          Feedback column
          <input
            name="feedbackColumn"
            required
            defaultValue={
              reviewFeed?.kind === "bookReviews"
                ? reviewFeed.mapping.feedbackColumn
                : "Review"
            }
          />
        </label>
        <label>
          ISBN column
          <input
            name="isbnColumn"
            defaultValue={
              reviewFeed?.kind === "bookReviews"
                ? (reviewFeed.mapping.isbnColumn ?? "")
                : "ISBN"
            }
          />
        </label>
        <label>
          Title column
          <input
            name="titleTextColumn"
            defaultValue={
              reviewFeed?.kind === "bookReviews"
                ? (reviewFeed.mapping.titleTextColumn ?? "")
                : ""
            }
          />
        </label>
        <FeedActions
          feed={reviewFeed}
          label="Book review sheet"
          onEnable={enable}
          onDisable={disable}
        />
      </form>

      <form className="card stack" onSubmit={saveDonationFeed}>
        <h2>Donation application sheet</h2>
        <FeedIdentityFields
          spreadsheetId={donationFeed?.spreadsheetId}
          tabName={donationFeed?.tabName}
          identityColumns={
            donationFeed?.kind === "donationApplications"
              ? donationFeed.mapping.identityColumns.join(", ")
              : "Timestamp, Email"
          }
        />
        <label>
          Name column
          <input
            name="nameColumn"
            required
            defaultValue={
              donationFeed?.kind === "donationApplications"
                ? donationFeed.mapping.nameColumn
                : "Name"
            }
          />
        </label>
        <label>
          Email column
          <input
            name="emailColumn"
            defaultValue={
              donationFeed?.kind === "donationApplications"
                ? (donationFeed.mapping.emailColumn ?? "")
                : "Email"
            }
          />
        </label>
        <label>
          School name column
          <input
            name="schoolNameColumn"
            defaultValue={
              donationFeed?.kind === "donationApplications"
                ? (donationFeed.mapping.schoolNameColumn ?? "")
                : "School"
            }
          />
        </label>
        <label>
          School address column
          <input
            name="schoolAddressColumn"
            defaultValue={
              donationFeed?.kind === "donationApplications"
                ? (donationFeed.mapping.schoolAddressColumn ?? "")
                : "Address"
            }
          />
        </label>
        <label>
          Message column
          <input
            name="messageColumn"
            defaultValue={
              donationFeed?.kind === "donationApplications"
                ? (donationFeed.mapping.messageColumn ?? "")
                : ""
            }
          />
        </label>
        <FeedActions
          feed={donationFeed}
          label="Donation application sheet"
          onEnable={enable}
          onDisable={disable}
        />
      </form>

      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function FeedIdentityFields({
  spreadsheetId,
  tabName,
  identityColumns,
}: {
  spreadsheetId?: string;
  tabName?: string;
  identityColumns: string;
}) {
  return (
    <>
      <label>
        Spreadsheet id
        <input name="spreadsheetId" required defaultValue={spreadsheetId ?? ""} />
      </label>
      <label>
        Tab name
        <input name="tabName" required defaultValue={tabName ?? ""} />
      </label>
      <label>
        Identity columns
        <input name="identityColumns" required defaultValue={identityColumns} />
      </label>
    </>
  );
}

function FeedActions({
  feed,
  label,
  onEnable,
  onDisable,
}: {
  feed:
    | {
        _id: Id<"intakeFeeds">;
        state: { kind: "disabled" } | { kind: "enabled"; verifiedAt: number };
        lastPoll?:
          | { kind: "ok"; at: number; rowsSeen: number; newItems: number }
          | { kind: "failed"; at: number; message: string };
        health: { message?: string };
      }
    | undefined;
  label: string;
  onEnable: (feedId: Id<"intakeFeeds">, label: string) => Promise<void>;
  onDisable: (feedId: Id<"intakeFeeds">, label: string) => Promise<void>;
}) {
  return (
    <>
      <button className="button" type="submit">
        Save mapping
      </button>
      {feed ? (
        <div className="row">
          <button
            className="button"
            type="button"
            onClick={() => onEnable(feed._id, label)}
          >
            Verify and enable
          </button>
          {feed.state.kind === "enabled" ? (
            <button
              className="button"
              type="button"
              onClick={() => onDisable(feed._id, label)}
            >
              Disable
            </button>
          ) : null}
        </div>
      ) : null}
      {feed?.lastPoll ? (
        <p className="muted">
          {feed.lastPoll.kind === "ok"
            ? `Last poll saw ${feed.lastPoll.rowsSeen} rows and added ${feed.lastPoll.newItems}.`
            : `Last poll failed: ${feed.lastPoll.message}`}
        </p>
      ) : null}
      {feed?.health.message ? <p role="status">{feed.health.message}</p> : null}
    </>
  );
}
