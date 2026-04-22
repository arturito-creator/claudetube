import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaudeTube — watch Claude Design animations",
  description:
    "ClaudeTube hosts Claude Design HTML bundles so anyone can watch them live in the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-black/10 bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-brand">Claude</span>Tube
            </Link>
            <form action="/search" className="flex-1 max-w-md">
              <input
                name="q"
                placeholder="Search animations, channels…"
                className="w-full h-9 rounded-full border border-black/15 px-4 bg-white focus:outline-none focus:border-brand"
              />
            </form>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/upload" className="rounded-full bg-ink text-white px-3 py-1.5">
                Upload
              </Link>
              <Link href="/signin" className="text-ink/70 hover:text-ink">
                Sign in
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-ink/60">
          ClaudeTube is an independent fan project. Claude Design is a product of Anthropic.
        </footer>
      </body>
    </html>
  );
}
