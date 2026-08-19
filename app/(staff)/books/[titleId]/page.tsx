import { TitleWorkspace } from "@/components/books/title-workspace";
import type { Id } from "@/convex/_generated/dataModel";

export default async function TitlePage({
  params,
}: {
  params: Promise<{ titleId: string }>;
}) {
  const { titleId } = await params;
  return (
    <main id="content" className="stack">
      <TitleWorkspace titleId={titleId as Id<"titles">} />
    </main>
  );
}
