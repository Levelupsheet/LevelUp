'use client';
import { useEffect, useState } from 'react';
import QuestionPipelineAdmin from '@/components/QuestionPipelineAdmin';
export default function ContentStudio() {
  const [authorized, setAuthorized] = useState(false);
  const [view, setView] = useState<'manage' | 'import' | 'review' | 'publish'>('import');
  useEffect(() => {
    let mounted = true;
    void fetch('/api/auth/me', { cache: 'no-store' }).then(async r => {
      const data = await r.json();
      if (!mounted) return;
      if (r.ok && data?.user?.isAdmin) setAuthorized(true);
      else window.location.href = '/dashboard';
    }).catch(() => { if (mounted) window.location.href = '/dashboard'; });
    return () => { mounted = false; };
  }, []);
  if (!authorized) return <p role="status">Checking admin access…</p>;
  return <main className="container">
    <h1>Import questions to a pool</h1>
    <p>Choose Training, Certification Practice, or Test Now. Upload question-bank JSON or knowledge JSON here, review the imported questions, then publish to that destination.</p>
    <a href="/admin">Back to admin</a>
    <QuestionPipelineAdmin view={view} onViewChange={setView} />
    <details><summary>Previously saved Content Studio drafts</summary>
      <p>Your saved knowledge blocks and generated drafts are preserved.</p>
      <a href="/admin/content/legacy">Open legacy draft manager</a>
    </details>
  </main>;
}
