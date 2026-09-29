import { SignUp } from "@clerk/nextjs";
import { BookOpen } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main id="content" className="auth-page stack">
        <Link className="brand brand-dark" href="/">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={21} /></span>
          <span><strong>Joy for Books</strong><small>Staff sign up</small></span>
        </Link>
        <h1>Staff authentication is not configured</h1>
      </main>
    );
  }

  return (
    <main id="content" className="auth-page stack">
      <Link className="brand brand-dark" href="/">
        <span className="brand-mark" aria-hidden="true"><BookOpen size={21} /></span>
        <span><strong>Joy for Books</strong><small>Staff sign up</small></span>
      </Link>
      <SignUp fallbackRedirectUrl="/books" />
    </main>
  );
}
