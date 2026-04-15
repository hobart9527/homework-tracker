import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export function normalizeProtectedPath(pathname: string) {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) {
      return "/";
    }

    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || "/";
    }
  }

  return pathname;
}

export function isParentProtectedPath(pathname: string) {
  const normalizedPath = normalizeProtectedPath(pathname);
  const protectedPaths = ["/dashboard", "/homework", "/children", "/settings"];

  return protectedPaths.some((path) => normalizedPath.startsWith(path));
}

export function isChildProtectedPath(pathname: string) {
  const normalizedPath = normalizeProtectedPath(pathname);
  const childProtectedPaths = ["/progress", "/rewards"];

  return (
    normalizedPath === "/" ||
    childProtectedPaths.some((path) => normalizedPath.startsWith(path))
  );
}

export async function middleware(request: NextRequest) {
  // Run next-intl middleware first
  const response = intlMiddleware(request);

  const supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          supabaseResponse.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPath = isParentProtectedPath(request.nextUrl.pathname);
  const isProtectedChildPath = isChildProtectedPath(request.nextUrl.pathname);

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Child routes need auth too (redirect to child-login)
  if (isProtectedChildPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/child-login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
