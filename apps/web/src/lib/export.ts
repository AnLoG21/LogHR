const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function downloadXlsx(entity: string, filename?: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(`${API}/api/import-export/export?entity=${encodeURIComponent(entity)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${entity}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadXlsx(kind: 'candidates' | 'org-units', file: File) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/api/import-export/import/${kind}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data as { imported: number };
}
