import type { Metadata } from 'next';
import './globals.css';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ToastContainer } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'AllForward Admin',
  description: 'Admin Control Panel for AllForward Telegram Automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthGuard>{children}</AuthGuard>
        <ToastContainer />
      </body>
    </html>
  );
}
