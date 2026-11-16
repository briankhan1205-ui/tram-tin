const TZ = process.env.APP_TIMEZONE || "Asia/Ho_Chi_Minh";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const fullFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, dateStyle: "short", timeStyle: "short", hour12: false });

export const dayKey = (d: Date) => dayKeyFmt.format(d); // YYYY-MM-DD theo TZ
export const formatTime = (d: Date) => timeFmt.format(d);
export const formatFull = (d: Date) => fullFmt.format(d);

export function dayLabel(d: Date, now = new Date()): string {
  const k = dayKey(d);
  if (k === dayKey(now)) return "Hôm nay";
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Hôm qua";
  const s = dateFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeAgo(d: Date | null, now = new Date()): string {
  if (!d) return "chưa từng";
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}
