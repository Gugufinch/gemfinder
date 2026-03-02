import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Gem Finder | Artists and A&R Management',
  description: 'Gem Finder is an A&R scouting and outreach workspace with AI-assisted drafting, team auth, and artist pipeline management.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
