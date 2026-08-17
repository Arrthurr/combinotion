import { CreateTitleForm } from "@/components/books/create-title-form";

export default function NewTitlePage() {
  return (
    <main id="content" className="stack">
      <h1>Add a title</h1>
      <CreateTitleForm />
    </main>
  );
}
