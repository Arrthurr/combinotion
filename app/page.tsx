import type { Route } from "next";
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/sign-in" as Route);
}
