import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIScrumBoard',
  description: 'AI-driven Scrum orchestration platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
