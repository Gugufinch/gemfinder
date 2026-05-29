export async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const previewLink = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[bonafied] magic-link for ${email}: ${previewLink}`);
  }

  return {
    ok: true,
    previewLink,
  };
}
