import { cookies } from 'next/headers';
import GemFinderApp from '@/gem-finder-v7.jsx';
import ARLogin from './ARLogin';
import { getArAuthUserById } from '@/lib/bonafied/repository';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default async function ARPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get('ar_user')?.value || '';
  const qp = searchParams ? await searchParams : {};
  const modeParam = pickString(qp.mode);
  const resetTokenParam = pickString(qp.resetToken);
  const initialMode = modeParam === 'signup' ? 'signup' : 'login';

  if (!userId) {
    return <ARLogin initialMode={initialMode} initialResetToken={resetTokenParam} />;
  }

  const authUser = await getArAuthUserById(userId);
  if (!authUser || !authUser.active) {
    return <ARLogin initialMode={initialMode} initialResetToken={resetTokenParam} />;
  }

  return <GemFinderApp authUserId={authUser.userId} authEmail={authUser.email} authRole={authUser.role} />;
}
