"use client";
import { useEffect, useState } from "react";
import type { ContentPool } from "./contentPools";
export function useContentPools(enabled = true) {
  const [pools, setPools] = useState<ContentPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(null);
    fetch("/api/content/pools", { cache: "no-store" })
      .then(async res => { const json = await res.json(); if (!res.ok) throw new Error(json.error || "Could not load pools"); return json; })
      .then(json => { if (active) setPools((json.pools || []).filter((p: ContentPool) => p.questionCount > 0)); })
      .catch(err => { if (active) { setPools([]); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled]);
  return { pools, loading, error };
}
