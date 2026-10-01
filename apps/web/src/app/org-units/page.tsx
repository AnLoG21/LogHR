'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Icon, Input, Modal } from '@/components/ui';
import { AddressSuggest } from '@/components/address-suggest';
import { api } from '@/lib/api';
import { downloadXlsx, uploadXlsx } from '@/lib/export';

export default function OrgUnitsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [addr, setAddr] = useState('');
  const [cityDraft, setCityDraft] = useState('');

  const list = useQuery({
    queryKey: ['org-units', nameFilter, cityFilter],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: '100' });
      if (nameFilter) p.set('search', nameFilter);
      if (cityFilter) p.set('city', cityFilter);
      return api<any>(`/org-units?${p}`);
    },
  });

  const create = useMutation({
    mutationFn: (body: any) => api('/org-units', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['org-units'] });
    },
  });

  const items = useMemo(() => {
    return (list.data?.items || []).filter((u: any) => {
      if (codeFilter && !(u.code || '').toLowerCase().includes(codeFilter.toLowerCase())) return false;
      return true;
    });
  }, [list.data, codeFilter]);

  function clearFilters() {
    setNameFilter('');
    setCodeFilter('');
    setCityFilter('');
  }

  async function onImport(file?: File | null) {
    if (!file) return;
    try {
      const res = await uploadXlsx('org-units', file);
      setMsg(`Импортировано: ${res.imported}`);
      qc.invalidateQueries({ queryKey: ['org-units'] });
    } catch (e: any) {
      setMsg(e?.message || 'Ошибка импорта');
    }
  }

  return (
    <AppShell
      title="Орг. единицы"
      subtitle="Список Ваших организационных единиц"
      actions={
        <>
          <button className="sk-btn sk-btn-icon" title="Экспорт XLSX" type="button" onClick={() => downloadXlsx('org-units')}>
            <Icon name="xls" />
          </button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>Импортировать орг. единицы</Button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          <Button onClick={() => setShowForm(true)}>
            <Icon name="plus" className="w-4 h-4" /> Добавить орг. единицу
          </Button>
        </>
      }
    >
      <Card className="p-4 mb-4">
        <div className="text-[13px] font-semibold text-[var(--sk-label)] mb-3">Фильтры орг. единиц</div>
        <div className="grid md:grid-cols-4 gap-2">
          <input className="sk-input" placeholder="Название" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
          <input className="sk-input" placeholder="Внешний идентификатор" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} />
          <input className="sk-input" placeholder="Город" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
          <div className="flex gap-2">
            <Button className="flex-1" type="button" onClick={() => list.refetch()}>Применить</Button>
            <Button variant="ghost" className="!bg-[var(--sk-teal)] !text-white !border-0" type="button" onClick={clearFilters}>Очистить</Button>
          </div>
        </div>
        {msg ? <div className="text-sm text-[var(--sk-muted)] mt-2">{msg}</div> : null}
      </Card>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold">Всего {items.length} орг. единицы</div>
      </div>

      {list.isLoading ? <Empty text="Загрузка…" /> : null}
      <div className="space-y-3">
        {items.map((u: any) => (
          <Card key={u.id} className="p-5">
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold leading-snug">{u.name}</div>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-[13px]">
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Адрес</span><span>{u.address || u.city || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Статус</span><span className="text-[var(--sk-green)] font-semibold">{u.isActive === false ? 'Архив' : 'Открытая'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Код</span><span>{u.code || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-40 shrink-0">Заявок</span><span>{u._count?.hiringRequests ?? 0}</span></div>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!list.isLoading && !items.length ? <Empty text="Список пуст" /> : null}
      </div>

      <Modal open={showForm} title="Новая орг. единица" onClose={() => setShowForm(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            create.mutate({
              name: fd.get('name'),
              code: fd.get('code') || undefined,
              city: cityDraft || fd.get('city') || undefined,
              address: addr || undefined,
            });
          }}
        >
          <Input name="name" placeholder="Название" required />
          <Input name="code" placeholder="Код в 1С / учётной системе (необязательно)" />
          <Input name="city" placeholder="Город" value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} />
          <AddressSuggest
            value={addr}
            onChange={setAddr}
            onPick={(s) => {
              setAddr(s.value);
              if (s.city) setCityDraft(s.city);
            }}
            placeholder="Адрес (DaData)"
          />
          <Button type="submit" disabled={create.isPending}>Создать</Button>
          {create.isError ? <div className="text-sm text-[var(--sk-danger)]">Недостаточно прав. Обратитесь к администратору.</div> : null}
        </form>
      </Modal>
    </AppShell>
  );
}
