import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main id="content" className="stack">
        <h1>Staff authentication is not configured</h1>
      </main>
    );
  }

  return (
    <main id="content" className="stack">
      <SignUp />
    </main>
  );
}
