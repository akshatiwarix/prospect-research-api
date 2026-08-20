import { Console } from "./components/Console";

/**
 * A shell. Every byte the console shows comes back through the public API, so
 * there is nothing for a server component to pre-compute here — and if there
 * were, the console would have a privilege a caller does not.
 */
export default function Home() {
  return (
    <main className="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <Console />
    </main>
  );
}
