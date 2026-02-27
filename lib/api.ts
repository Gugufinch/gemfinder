const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const rawBase = (import.meta.env.VITE_API_BASE_URL || '').toString().trim();
const apiBase = rawBase ? trimTrailingSlash(rawBase) : '';

export const apiUrl = (path: string) => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalized}` : normalized;
};
