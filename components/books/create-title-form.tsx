"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function TitleFields({
  disabled,
  status,
  onSubmit,
}: {
  disabled: boolean;
  status: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="card stack" onSubmit={onSubmit}>
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
      <button className="button" disabled={disabled}>
        Save title
      </button>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

export function CreateTitleForm() {
  if (!convexConfigured) {
    return <TitleFields disabled status="Saving titles is not available yet." />;
  }
  return <CreateTitleFormLive />;
}

function CreateTitleFormLive() {
  const createTitle = useMutation(api.titles.createTitle);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving…");
    try {
      await createTitle({
        title: String(data.get("title") ?? ""),
        author: String(data.get("author") ?? ""),
        isbn: String(data.get("isbn") ?? ""),
      });
      form.reset();
      setStatus("Title saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save title.");
    }
  }

  return <TitleFields disabled={false} status={status} onSubmit={submit} />;
}
