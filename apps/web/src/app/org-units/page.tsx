'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { AddressSuggest } from '@/components/address-suggest';
import { api } from '@/lib/api';
import { downloadXlsx, uploadXlsx } from '@/lib/export';

type UnitForm = {
  id?: string;
  name: string;
  code: string;
  city: string;
  address: string;
  legalEntity: string;
  parentId: string;
  isActive: boolean;
};

const EMPTY_FORM: UnitForm = { name: '', code: '', city: '', address: '', legalEntity: '', parentId: '', isActive: true };

export default function OrgUnitsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<UnitForm | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState('');

  const list = useQuery({
    queryKey: ['org-units', nameFilter, cityFilter, showArchived],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: '100' });
      if (nameFilter) p.set('search', nameFilter);
      if (cityFilter) p.set('city', cityFilter);
      if (showArchived) p.set('archived', 'true');
      return api<any>(`/org-units?${p}`);
    },
  });
  const allUnits = useQuery({ queryKey: ['org-units-mini'], queryFn: () => api<any>('/org-units?pageSize=100') });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['org-units'] });
    qc.invalidateQueries({ queryKey: ['org-units-mini'] });
  };

  const save = useMutation({
    mutationFn: (f: UnitForm) => {
      const body: any = {
        name: f.name,
        code: f.code,
        city: f.city,
        address: f.address,
        legalEntity: f.legalEntity,
      };
      if (f.id) {
        body.parentId = f.parentId || null;
        return api(`/org-units/${f.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      for (const k of Object.keys(body)) if (!body[k]) delete body[k];
      if (f.parentId) body.parentId = f.parentId;
      return api('/org-units', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => { setForm(null); refresh(); },
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/org-units/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => { setForm(null); refresh(); },
  });

  const items = useMemo(() => {
    return (list.data?.items || []).filter((u: any) => {
      if (codeFilter && !(u.code || '').toLowerCase().includes(codeFilter.toLowerCase())) return false;
      return true;
    });
  }, [list.data, codeFilter]);

  const parentOptions = (allUnits.data?.items || []).filter((u: any) => u.id !== form?.id);

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
      refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Ошибка импорта');
    }
  }

  function openEdit(u: any) {
    setForm({
      id: u.id,
      name: u.name || '',
      code: u.code || '',
      city: u.city || '',
      address: u.address || '',
      legalEntity: u.legalEntity || '',
      parentId: u.parentId || '',
      isActive: u.isActive !== false,
    });
  }

  return (
    <AppShell
      title="Орг. единицы"
      subtitle="Подразделения и площадки компании"
      actions={
        <>
          <button className="sk-btn sk-btn-icon" title="Экспорт в Excel" aria-label="Экспорт в Excel" type="button" onClick={() => downloadXlsx('org-units')}>
            <Icon name="xls" />
          </button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>Импорт из Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          <Button onClick={() => setForm({ ...EMPTY_FORM })}>
            <Icon name="plus" className="w-4 h-4" /> Добавить орг. единицу
          </Button>
        </>
      }
    >
      <Card className="p-4 mb-4">
        <div className="grid md:grid-cols-4 gap-2">
          <Input placeholder="Название" aria-label="Название" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
          <Input placeholder="Код" aria-label="Код" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} />
          <Input placeholder="Город" aria-label="Город" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />
          <Button variant="ghost" type="button" onClick={clearFilters} disabled={!nameFilter && !codeFilter && !cityFilter}>Сбросить фильтры</Button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Показать архивные
        </label>
        {msg ? <div className="text-sm text-[var(--sk-muted)] mt-2">{msg}</div> : null}
      </Card>

      <div className="text-[13px] font-semibold mb-3">Всего: {items.length}</div>

      {list.isLoading ? <Empty text="Загрузка…" /> : null}
      <div className="space-y-3">
        {items.map((u: any) => (
          <Card key={u.id} className={`p-5 ${u.isActive === false ? 'opacity-70' : ''}`}>
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold leading-snug">{u.name}</div>
                {u.parent ? <div className="text-[13px] text-[var(--sk-muted)] mt-1">Входит в: {u.parent.name}</div> : null}
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-[13px]">
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-32 shrink-0">Адрес</span><span>{u.address || u.city || '—'}</span></div>
                  <div className="flex gap-2">
                    <span className="text-[var(--sk-muted)] w-32 shrink-0">Статус</span>
                    <span className={`font-semibold ${u.isActive === false ? 'text-[var(--sk-muted)]' : 'text-[var(--sk-text-success)]'}`}>{u.isActive === false ? 'В архиве' : 'Действует'}</span>
                  </div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-32 shrink-0">Код</span><span>{u.code || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-32 shrink-0">Юрлицо</span><span>{u.legalEntity || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-32 shrink-0">Заявок</span><span>{u._count?.hiringRequests ?? 0}</span></div>
                  <div className="flex gap-2"><span className="text-[var(--sk-muted)] w-32 shrink-0">Потребностей</span><span>{u._count?.demands ?? 0}</span></div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {u.isActive === false ? (
                  <Button variant="ghost" onClick={() => setActive.mutate({ id: u.id, isActive: true })} disabled={setActive.isPending}>Вернуть из архива</Button>
                ) : (
                  <Button variant="ghost" onClick={() => openEdit(u)}><Icon name="edit" className="w-4 h-4" /> Изменить</Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {!list.isLoading && !items.length ? <Empty text="Список пуст" /> : null}
      </div>

      <Modal open={!!form} title={form?.id ? 'Изменить орг. единицу' : 'Новая орг. единица'} onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <Field label="Название">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Код в 1С" hint="Необязательно">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </Field>
              <Field label="Юрлицо" hint="Необязательно">
                <Input value={form.legalEntity} onChange={(e) => setForm({ ...form, legalEntity: e.target.value })} />
              </Field>
            </div>
            <Field label="Входит в подразделение">
              <Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">Верхний уровень</option>
                {parentOptions.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Город">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Адрес">
              <AddressSuggest
                value={form.address}
                onChange={(v) => setForm((f) => (f ? { ...f, address: v } : f))}
                onPick={(s) => setForm((f) => (f ? { ...f, address: s.value, city: s.city || f.city } : f))}
                placeholder="Начните вводить адрес"
              />
            </Field>
            <ErrorText error={save.error || setActive.error} />
            <div className="flex flex-wrap justify-between gap-2">
              {form.id ? (
                <ConfirmDelete
                  label="В архив"
                  question="Убрать в архив? Подразделение пропадёт из списков выбора."
                  onConfirm={() => setActive.mutate({ id: form.id!, isActive: false })}
                  pending={setActive.isPending}
                />
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>Отмена</Button>
                <Button type="submit" disabled={save.isPending}>Сохранить</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}
