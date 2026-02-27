import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'BONAFIED | Premium News Intelligence',
  description:
    'BONAFIED is a premium real-time intelligence surface for verified same-day signals across business, technology, music industry, and creator economy.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
