export async function contentRequest(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, { method, cache: 'no-store', ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`Question content request failed (HTTP ${response.status}). The server returned an empty or invalid response. Check server logs and run npm run deploy:build before restarting.`);
  }
  if (!response.ok) throw new Error(data.error || `Question content request failed (HTTP ${response.status})`);
  return data;
}
