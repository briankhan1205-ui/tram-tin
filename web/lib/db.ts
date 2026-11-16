import "server-only";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

declare global {
  // Giữ 1 pool qua các lần HMR khi dev.
  var __tramTinSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  // .env dùng chung ở gốc dự án; worker của Next không thừa hưởng env nạp trong next.config.
  if (!process.env.DATABASE_URL) loadEnvConfig(path.resolve(process.cwd(), ".."));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL (xem .env ở gốc dự án)");
  return postgres(url, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { application_name: "tram-tin-web", default_transaction_read_only: true },
  });
}

/** Pool khởi tạo lười: build không cần DB, request đầu tiên mới kết nối. */
export function db(): postgres.Sql {
  return (globalThis.__tramTinSql ??= create());
}
