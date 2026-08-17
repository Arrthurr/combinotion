export default function NewTitlePage() {
  return (
    <main id="content" className="stack">
      <h1>Add a title</h1>
      <form className="card stack">
        <label>
          Title
          <input required name="title" />
        </label>
        <label>
          Author
          <input required name="author" />
        </label>
        <label>
          ISBN
          <input required name="isbn" />
        </label>
        <button className="button" disabled>
          Save title
        </button>
        <p className="muted" role="status" aria-live="polite">
          Saving titles is not available yet.
        </p>
      </form>
    </main>
  );
}
