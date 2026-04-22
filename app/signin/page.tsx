import Link from "next/link";
import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

async function signInAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const res = await signIn("credentials", {
    email,
    password,
    redirect: false,
  });
  if (!res || (res as { error?: string }).error) {
    redirect("/signin?error=1");
  }
  redirect("/");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-semibold mb-6">Sign in to ClaudeTube</h1>
      {sp.error && (
        <p className="mb-4 text-sm text-red-600">
          Invalid email or password.
        </p>
      )}
      <form action={signInAction} className="space-y-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full h-10 rounded-md border border-black/15 px-3"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={8}
          className="w-full h-10 rounded-md border border-black/15 px-3"
        />
        <button
          type="submit"
          className="w-full h-10 rounded-md bg-ink text-white font-medium"
        >
          Sign in
        </button>
      </form>
      <p className="text-sm text-ink/70 mt-4">
        No account?{" "}
        <Link href="/signup" className="text-brand">
          Create one
        </Link>
      </p>
    </div>
  );
}
