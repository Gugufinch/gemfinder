import { cookies } from 'next/headers';
import GemFinderApp from './GemFinderApp.jsx';
import ARLogin from './ARLogin';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { verifySession } from '@/lib/gemfinder/session';

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = 'force-dynamic';

function pickString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default async function ARPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const qp = searchParams ? await searchParams : {};
  const modeParam = pickString(qp.mode);
  const resetTokenParam = pickString(qp.resetToken);
  const initialMode = modeParam === 'signup' ? 'signup' : 'login';

  try {
    const cookieStore = await cookies();
    // Audit #2 follow-up: the ar_user cookie is an HMAC-signed token, not a
    // raw userId. Verify it the same way the API routes do (getSessionUserId).
    // Reading the raw value here was the bug that made login impossible after
    // Audit #2 — the signed token never matched a real userId, so this gate
    // always fell through to the login screen even with a valid session.
    const userId = verifySession(cookieStore.get('ar_user')?.value)?.uid || '';

    if (!userId) {
      return <ARLogin initialMode={initialMode} initialResetToken={resetTokenParam} />;
    }

    const authUser = await getAuthUserById(userId);
    if (!authUser || !authUser.active) {
      return <ARLogin initialMode={initialMode} initialResetToken={resetTokenParam} />;
    }

    return <GemFinderApp authUserId={authUser.userId} authEmail={authUser.email} authRole={authUser.role} />;
  } catch (error) {
    console.error('[gemfinder] /ar auth gate failed', error);
    return <ARLogin initialMode={initialMode} initialResetToken={resetTokenParam} />;
  }
}
