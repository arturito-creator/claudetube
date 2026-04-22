import { NextResponse, type NextRequest } from "next/server";

/**
 * Global security headers. Bundle routes (`/b/*`) and thumbnail routes set
 * their own CSP; this middleware covers the main app.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  // Let /b/* and /thumb/* handle their own headers.
  if (pathname.startsWith("/b/") || pathname.startsWith("/thumb/")) return res;

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
