import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  parseRow,
  redactError,
  type IntakeFeedKind,
  type IntakeMapping,
} from "../../lib/domain/intake";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw?.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  return { client_email: clientEmail, private_key: privateKey };
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(value: object) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function importPrivateKey(pem: string) {
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function googleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await importPrivateKey(account.private_key);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    ),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error("Google token request failed");
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("access_token" in body) ||
    typeof body.access_token !== "string"
  ) {
    throw new Error("Google token response was invalid");
  }
  return body.access_token;
}

async function fetchTab(
  token: string,
  spreadsheetId: string,
  tabName: string,
) {
  const range = encodeURIComponent(`${tabName}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 403 || response.status === 404) {
    throw new Error("Sheet or tab is not readable");
  }
  if (!response.ok) {
    throw new Error("Google Sheets request failed");
  }
  const body: unknown = await response.json();
  const values =
    typeof body === "object" &&
    body !== null &&
    "values" in body &&
    Array.isArray(body.values)
      ? body.values
      : [];
  const [headers = [], ...rows] = values as string[][];
  return {
    headers: headers.map((cell) => String(cell)),
    rows: rows.map((cells) => cells.map((cell) => String(cell ?? ""))),
  };
}

export const verifyFeed = internalAction({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
    const feed = await ctx.runQuery(internal.intake.getFeed, { feedId });
    if (!feed) {
      throw new Error("Feed not found");
    }
    const token = await googleAccessToken(
      parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    );
    const tab = await fetchTab(token, feed.spreadsheetId, feed.tabName);
    const requiredColumns = Object.values(feed.mapping).flatMap((value) =>
      Array.isArray(value) ? value : value ? [value] : [],
    );
    const missing = requiredColumns.filter(
      (column) => !tab.headers.includes(column),
    );
    if (missing.length > 0) {
      throw new Error(`Missing mapped columns: ${missing.join(", ")}`);
    }
    return { headers: tab.headers };
  },
});

export const pollApprovedFeeds = internalAction({
  args: {},
  handler: async (ctx) => {
    const feeds = await ctx.runQuery(internal.intake.listPollableFeeds, {});
    if (feeds.length === 0) {
      return;
    }
    let token: string;
    try {
      token = await googleAccessToken(
        parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      );
    } catch (error) {
      const message = redactError(error);
      for (const feed of feeds) {
        await ctx.runMutation(internal.intake.recordFeedPoll, {
          feedId: feed._id,
          outcome: { kind: "failed", at: Date.now(), message },
        });
      }
      return;
    }
    for (const feed of feeds) {
      try {
        const tab = await fetchTab(token, feed.spreadsheetId, feed.tabName);
        const rows = tab.rows.map((cells) =>
          parseRow(
            {
              kind: feed.kind as IntakeFeedKind,
              mapping: feed.mapping as IntakeMapping,
              spreadsheetId: feed.spreadsheetId,
              tabName: feed.tabName,
            },
            tab.headers,
            cells,
          ),
        );
        await ctx.runMutation(internal.intake.recordRows, {
          feedId: feed._id,
          rows,
        });
      } catch (error) {
        await ctx.runMutation(internal.intake.recordFeedPoll, {
          feedId: feed._id,
          outcome: {
            kind: "failed",
            at: Date.now(),
            message: redactError(error),
          },
        });
      }
    }
  },
});
