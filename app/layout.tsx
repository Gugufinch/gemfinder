import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'GEMFINDER | Artists and A&R Management',
  description: 'GEMFINDER is an A&R scouting and outreach workspace with AI-assisted drafting, team auth, and artist pipeline management.',
  icons: {
    icon: '/gemfinder-logo.png',
    shortcut: '/gemfinder-logo.png',
    apple: '/gemfinder-logo.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
