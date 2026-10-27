import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/** Where admin 2FA codes and report notifications are sent. */
export const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "pittsburghtornadoes@gmail.com";

export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;

/**
 * Sends a plain-text email over SMTP. Without SMTP configured, development logs
 * the message to the server console; production throws.
 */
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.warn(`\n[mail:dev] SMTP not configured — would send to ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
