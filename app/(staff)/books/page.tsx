import Link from "next/link";
import { BooksCatalog } from "@/components/books/books-catalog";

export default function BooksPage() {
  return (
    <main id="content" className="stack">
      <h1>Book catalog</h1>
      <p className="muted">Add titles with a title, author, and ISBN before receiving inventory.</p>
      <Link className="button" href="/books/new">
        Add a title
      </Link>
      <BooksCatalog />
    </main>
  );
}
