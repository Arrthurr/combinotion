import { PeopleManager } from "@/components/people/people-manager";

export default function PeoplePage() {
  return (
    <main id="content" className="stack">
      <h1>People</h1>
      <p>
        People can hold several relationship roles, including school staff,
        reader, volunteer, and reviewer.
      </p>
      <PeopleManager />
    </main>
  );
}
