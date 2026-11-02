import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">GST Sales Portal</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in with the credentials given by your CA.</p>
        <LoginForm />
      </div>
    </main>
  );
}
