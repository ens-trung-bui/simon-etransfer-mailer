import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import nodemailer from "nodemailer";

const root = new URL("./", import.meta.url);
const envPath = fileURLToPath(new URL(".env", root));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function ask(label, defaultValue = "") {
  const answer = (
    await prompt.question(`${label} [${defaultValue}] (- để bỏ trống): `)
  ).trim();
  return answer === "-" ? "" : answer || defaultValue;
}

async function askAmount() {
  while (true) {
    const value = (await ask("Số tiền CAD", "1667.30"))
      .replaceAll(",", "")
      .replace(/^\$/, "");
    const amount = Number(value);
    if (
      /^\d+(\.\d{1,2})?$/.test(value) &&
      amount > 0 &&
      Number.isSafeInteger(Math.round(amount * 100))
    ) {
      return amount.toLocaleString("en-CA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    console.info("Nhập số tiền > 0, tối đa 2 chữ số thập phân (vd: 1667.30).");
  }
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function createTransport() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const security = process.env.SMTP_SECURITY || "starttls";
  if (!["ssl", "starttls", "none"].includes(security)) {
    throw new Error("SMTP_SECURITY phải là ssl, starttls hoặc none.");
  }
  if (
    security === "none" &&
    !["localhost", "127.0.0.1", "::1"].includes(host)
  ) {
    throw new Error("SMTP không mã hóa chỉ được dùng cho localhost.");
  }
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (security !== "none" && (!user || !password)) {
    throw new Error(
      "Điền SMTP_USER và SMTP_PASSWORD (App Password) trong .env.",
    );
  }
  const port = Number(
    process.env.SMTP_PORT || (security === "ssl" ? 465 : 587),
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT không hợp lệ.");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: security === "ssl",
    requireTLS: security === "starttls",
    ignoreTLS: security === "none",
    auth: user
      ? {
          user,
          pass:
            host === "smtp.gmail.com" ? password?.replace(/\s/g, "") : password,
        }
      : undefined,
    connectionTimeout: 30_000,
    socketTimeout: 30_000,
  });
}

async function main() {
  const amount = await askAmount();
  const name = await ask("Tên người gửi", "JANE DAY SMITH");
  if (!name) throw new Error("Tên người gửi không được trống.");
  const invoice = (await ask("Invoice (Enter để bỏ trống)")).replace(/^#+\s*/, "");
  const agreement = (await ask("Agreement (Enter để bỏ trống)")).replace(/^#+\s*/, "");
  const reference = await ask(
    "Reference / X-PaymentKey",
    `TEST-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
  );
  if (!reference) throw new Error("Reference không được trống.");
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const headerDate = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const message = [
    invoice && `Invoice #${invoice}`,
    agreement && `Agreement #${agreement}`,
  ]
    .filter(Boolean)
    .join(" ");
  const values = {
    amount,
    name,
    message,
    reference,
    date: now.toLocaleDateString("en-CA", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
  };
  const template = await readFile(new URL("template.html", root), "utf8");
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values))
      throw new Error(`Template variable không hợp lệ: ${key}`);
    return escapeHtml(values[key]);
  });
  const preview = new URL("preview.html", root);
  await writeFile(preview, html);
  console.info(`\nCAD $${amount} | ${name} | ${message || "(no message)"}`);
  console.info(`Preview: ${fileURLToPath(preview)}`);
  if (process.argv.includes("--preview")) return;

  const to = await ask("Email nhận", process.env.SMTP_TO);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from || !to) throw new Error("Cần SMTP_FROM và email nhận.");
  const transport = createTransport();
  try {
    const confirmation = await prompt.question(
      `Gửi email TEST từ ${from} đến ${to}? [y/N]: `,
    );
    if (confirmation.trim().toLowerCase() !== "y") {
      console.info("Đã hủy, không gửi email.");
      return;
    }
    const result = await transport.sendMail({
      from,
      to,
      replyTo: process.env.SMTP_REPLY_TO || from,
      subject: `[TEST] $${amount} (CAD) from ${name} and it has been automatically deposited.`,
      // Preserve the casing expected by the worker's exact header lookup.
      normalizeHeaderKey: (key) =>
        key.toLowerCase() === "x-paymentkey" ? "X-PaymentKey" : key,
      headers: {
        "X-PaymentKey": reference,
        "X-Date": headerDate,
        "X-Simon-Test": "true",
      },
      text: `TEST FIXTURE — No real funds were transferred.\nAmount: $${amount} (CAD)\nSent From: ${name}\nMessage: ${message}\nReference Number: ${reference}\n`,
      html,
    });
    if (result.rejected.length)
      throw new Error(`SMTP từ chối: ${result.rejected.join(", ")}`);
    console.info(
      `SMTP đã nhận email: ${result.messageId}. Kiểm tra inbox/spam.`,
    );
  } finally {
    transport.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
