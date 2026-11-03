// طلب رمز دخول (OTP) يُرسل إلى البريد
import { NextResponse } from "next/server";
import { isEmail } from "@/lib/notify-core";
import { authEnabled, sign, randomCode, randomNonce, OTP_COOKIE } from "@/lib/server/auth-token";
import { findUserByEmail, otpHash, registerOtp, sendLimited, ipLimited, clientIp, deviceOf, maskEmail, OTP_MINUTES, RESEND_SECONDS } from "@/lib/server/auth-service";
import { mailConfig, sendMail } from "@/lib/server/mailer";
import { renderOtpEmail } from "@/lib/server/email-templates";
import { defaultBrand } from "@/lib/server/notify-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!authEnabled()) return NextResponse.json({ ok: false, error: "الدخول بالرمز غير مفعّل (AUTH_SECRET)" }, { status: 400 });
  const ip = clientIp(req);
  if (ipLimited(ip)) return NextResponse.json({ ok: false, error: "طلبات كثيرة — حاول بعد دقيقة" }, { status: 429 });

  let body = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "أدخل بريداً إلكترونياً صحيحاً" }, { status: 400 });

  const user = await findUserByEmail(email, body.users);
  if (!user) return NextResponse.json({ ok: false, error: "هذا البريد غير مسجّل في النظام — تواصل مع مدير النظام" }, { status: 404 });

  const limited = sendLimited(`e:${email}`) || sendLimited(`i:${ip}:${email}`);
  if (limited) return NextResponse.json({ ok: false, error: limited, retryIn: RESEND_SECONDS }, { status: 429 });

  const code = randomCode();
  const nonce = randomNonce();
  const exp = Date.now() + OTP_MINUTES * 60_000;
  const token = await sign({ t: "otp", e: email, n: nonce, h: await otpHash(nonce, email, code), x: exp, u: { id: String(user.id), name: user.name, role: user.role } });
  await registerOtp(nonce, email);

  const brand = { ...defaultBrand(), ...(body.brand && typeof body.brand.appName === "string" ? { appName: body.brand.appName.slice(0, 60) } : {}) };
  let devCode;
  if (mailConfig().provider) {
    const mail = renderOtpEmail({ code, name: user.name, brand, minutes: OTP_MINUTES, ip: ip === "local" ? "" : ip, device: deviceOf(req.headers.get("user-agent") || "") });
    try {
      await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `تعذّر إرسال البريد: ${String(e?.message || e).slice(0, 160)}` }, { status: 502 });
    }
  } else if (process.env.NODE_ENV !== "production") {
    devCode = code; // للتطوير فقط: البريد غير مُعدّ
    console.log(`[auth] OTP for ${email}: ${code}`);
  } else {
    return NextResponse.json({ ok: false, error: "البريد غير مُعدّ على الخادم — لا يمكن إرسال الرمز" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, to: maskEmail(email), name: user.name, expiresIn: OTP_MINUTES * 60, retryIn: RESEND_SECONDS, ...(devCode ? { devCode } : {}) });
  res.cookies.set(OTP_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: OTP_MINUTES * 60 });
  return res;
}
