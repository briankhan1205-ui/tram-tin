import { NextResponse, type NextRequest } from "next/server";

// Basic auth tùy chọn: bật khi đặt WEB_BASIC_AUTH_USER + WEB_BASIC_AUTH_PASSWORD trong .env.
function safeEqual(a: string, b: string): boolean {
  // So sánh hằng thời gian (không lộ độ dài khớp qua timing).
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const user = process.env.WEB_BASIC_AUTH_USER;
  const pass = process.env.WEB_BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) {
        return NextResponse.next();
      }
    } catch {
      /* header hỏng → 401 */
    }
  }
  return new NextResponse("Cần đăng nhập", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Tram Tin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
