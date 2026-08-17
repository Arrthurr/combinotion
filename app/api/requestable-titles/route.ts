import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";

export async function GET() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ titles: [] });
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const titles = await client.query(api.titles.listRequestable, {});
    return NextResponse.json({ titles });
  } catch {
    return NextResponse.json({ titles: [] }, { status: 502 });
  }
}
