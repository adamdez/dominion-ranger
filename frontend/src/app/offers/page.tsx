'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OffersRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/negotiation');
  }, [router]);

  return null;
}
