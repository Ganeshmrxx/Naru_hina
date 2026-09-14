'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { LoadingState } from '@/components/ui/LoadingState';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/login') {
      setChecking(false);
      return;
    }
    if (!isAuthenticated()) {
      router.push('/login');
    } else {
      setChecking(false);
    }
  }, [pathname, router]);

  if (checking && pathname !== '/login') {
    return <LoadingState message="Checking authentication..." />;
  }

  return <>{children}</>;
}
