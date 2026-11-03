// التحقق من الرمز وإنشاء جلسة دخول
import { NextResponse } from "next/server";
import { authEnabled, sign, verify, safeEqual, randomNonce, AUTH_COOKIE, OTP_COOKIE, SESSION_HOURS } from "@/lib/server/auth-token";
import { otpHash, consumeAttempt, markUsed, ipLimited, clientIp } from "@/lib/server/auth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!authEnabled()) return NextResponse.json({ ok: false, error: "الدخول بالرمز غير مفعّل" }, { status: 400 });
  if (ipLimited(`v:${clientIp(req)}`, 15)) return NextResponse.json({ ok: false, error: "محاولات كثيرة — حاول بعد دقيقة" }, { status: 429 });

  let body = {};
  try { body = await req.json(); } catch {}
  const code = String(body.code || "").replace(/\D/g, "");
  if (code.length !== 6) return NextResponse.json({ ok: false, error: "الرمز يتكون من 6 أرقام" }, { status: 400 });

  const otp = await verify(req.cookies.get(OTP_COOKIE)?.value);
  if (!otp || otp.t !== "otp") return NextResponse.json({ ok: false, expired: true, error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" }, { status: 401 });

  const att = await consumeAttempt(otp.n);
  if (att.error) return NextResponse.json({ ok: false, expired: true, error: att.error }, { status: 429 });

  if (!safeEqual(await otpHash(otp.n, otp.e, code), otp.h)) {
    return NextResponse.json({ ok: false, error: att.left > 0 ? `الرمز غير صحيح — تبقّى ${att.left} ${att.left === 1 ? "محاولة" : "محاولات"}` : "الرمز غير صحيح — اطلب رمزاً جديداً", left: att.left, expired: att.left <= 0 }, { status: 401 });
  }
  await markUsed(otp.n);

  const hours = SESSION_HOURS();
  const remember = body.remember !== false;
  const user = otp.u;
  const token = await sign({ t: "auth", uid: user.id, n: user.name, r: user.role, e: otp.e, s: randomNonce(8), x: Date.now() + hours * 3600_000 });
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, email: otp.e } });
  res.cookies.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", ...(remember ? { maxAge: hours * 3600 } : {}) });
  res.cookies.set(OTP_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return res;
}
