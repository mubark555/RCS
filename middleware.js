// حماية صفحات النظام وواجهاته: يتطلب جلسة دخول (OTP) عند ضبط AUTH_SECRET
import { NextResponse } from "next/server";
import { verify, AUTH_COOKIE } from "@/lib/server/auth-token";

const PUBLIC = [/^\/login(\/|$)/, /^\/api\/auth\//, /^\/api\/cron\//];

export async function middleware(req) {
  if (!(process.env.AUTH_SECRET || "").trim()) return NextResponse.next(); // الدخول غير مفعّل
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  const s = await verify(req.cookies.get(AUTH_COOKIE)?.value);
  if (s && s.t === "auth") return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "يجب تسجيل الدخول" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)"],
};
