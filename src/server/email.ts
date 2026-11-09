import "server-only";
import nodemailer from "nodemailer";

/**
 * Sends email through any SMTP service (the business Gmail now, Resend later: only these settings change).
 * Nothing is sent, and nothing breaks, until all five settings exist.
 */
function settings() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env.SMTP_PORT ?? "465");
  return { host, user, pass, from, port: Number.isFinite(port) ? port : 465 };
}

export function isEmailConfigured(): boolean {
  return settings() !== null;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email isn't set up yet");
  }
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const config = settings();
  if (!config) throw new EmailNotConfiguredError();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
}
