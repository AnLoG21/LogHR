'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui';
import { api } from '@/lib/api';

export function AddressSuggest({
  value,
  onChange,
  onPick,
  placeholder = 'Адрес',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (s: { value: string; city?: string | null }) => void;
  placeholder?: string;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value || value.trim().length < 3) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      api<any>(`/integrations/dadata/suggest?q=${encodeURIComponent(value)}`)
        .then((r) => {
          setItems(r.suggestions || []);
          setNote(r.configured ? null : r.note || 'DaData не настроена');
          setOpen(true);
        })
        .catch(() => setItems([]));
    }, 280);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ position: 'relative' }}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {note ? <div style={{ fontSize: 12, color: 'var(--sk-muted)', marginTop: 4 }}>{note}</div> : null}
      {open && items.length ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            background: '#fff',
            border: '1px solid var(--sk-line, #e5e7eb)',
            borderRadius: 10,
            maxHeight: 220,
            overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,.08)',
          }}
        >
          {items.map((s) => (
            <button
              key={s.value}
              type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.value);
                onPick?.({ value: s.value, city: s.city });
                setOpen(false);
              }}
            >
              {s.value}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
