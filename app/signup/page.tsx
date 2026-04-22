import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  handle: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_-]+$/, "letters, numbers, _ and - only"),
  password: z.string().min(8).max(200),
});

async function signUpAction(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    email: formData.get("email"),
    handle: formData.get("handle"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "invalid")}`);
  }
  const { email, handle, password } = parsed.data;
  const conflict = await prisma.user.findFirst({
    where: { OR: [{ email }, { handle }] },
  });
  if (conflict) {
    redirect("/signup?error=email%20or%20handle%20taken");
  }
  await prisma.user.create({
    data: { email, handle, password: await bcrypt.hash(password, 12) },
  });
  await signIn("credentials", { email, password, redirect: false });
  redirect("/");
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-semibold mb-6">Create your channel</h1>
      {sp.error && (
        <p className="mb-4 text-sm text-red-600">{sp.error}</p>
      )}
      <form action={signUpAction} className="space-y-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full h-10 rounded-md border border-black/15 px-3"
        />
        <input
          name="handle"
          type="text"
          placeholder="Channel handle (e.g. mira)"
          required
          minLength={3}
          maxLength={24}
          className="w-full h-10 rounded-md border border-black/15 px-3"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (8+ chars)"
          required
          minLength={8}
          className="w-full h-10 rounded-md border border-black/15 px-3"
        />
        <button
          type="submit"
          className="w-full h-10 rounded-md bg-ink text-white font-medium"
        >
          Create channel
        </button>
      </form>
      <p className="text-sm text-ink/70 mt-4">
        Already have an account?{" "}
        <Link href="/signin" className="text-brand">
          Sign in
        </Link>
      </p>
    </div>
  );
}
