import { TitleForm } from "@/components/books/title-form";

export default function NewTitlePage() {
  return (
    <main id="content" className="stack">
      <h1>Add a title</h1>
      <TitleForm mode={{ kind: "create" }} />
    </main>
  );
}
