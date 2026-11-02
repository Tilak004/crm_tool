import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import CALoginForm from "./CALoginForm";

export const metadata = { title: "CA sign in" };

// Separate sign-in for CA admin and staff. Not linked from the client pages.
export default async function CALoginPage() {
  const user = await currentUser();
  if (user) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">CA sign in</h1>
        <p className="mb-6 text-sm text-gray-500">For CA admin and staff. Needs your password and the code from your authenticator app.</p>
        <CALoginForm />
      </div>
    </main>
  );
}
