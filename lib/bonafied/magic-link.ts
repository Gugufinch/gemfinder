import nodemailer from 'nodemailer';

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !port || !user || !pass || !from) {
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  await transport.sendMail({
    from,
    to: email,
    subject: 'BONAFIED magic link',
    text: `Use this sign-in link: ${link}`,
    html: `<p>Use this sign-in link:</p><p><a href="${link}">${link}</a></p>`
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !port || !user || !pass || !from) {
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/ar?resetToken=${encodeURIComponent(token)}`;

  await transport.sendMail({
    from,
    to: email,
    subject: 'Gem Finder password reset',
    text: `Use this password reset link: ${link}`,
    html: `<p>Use this password reset link:</p><p><a href="${link}">${link}</a></p>`
  });
}
