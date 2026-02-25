'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PipelineRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('view') === 'board') {
      router.replace('/deal-board');
    } else {
      router.replace('/leads');
    }
  }, [router, searchParams]);

  return null;
}
