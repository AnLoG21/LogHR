'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, ConfirmDelete, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

type CategoryForm = { id?: string; name: string; allowMultiple: boolean };
type TagForm = { id?: string; name: string; categoryId: string };

export default function TagsPage() {
  const qc = useQueryClient();
  const [catForm, setCatForm] = useState<CategoryForm | null>(null);
  const [tagForm, setTagForm] = useState<TagForm | null>(null);
  const list = useQuery({ queryKey: ['tags'], queryFn: () => api<any[]>('/tags') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tags'] });

  const saveCat = useMutation({
    mutationFn: (f: CategoryForm) =>
      api(f.id ? `/tags/categories/${f.id}` : '/tags/categories', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: f.name, allowMultiple: f.allowMultiple }),
      }),
    onSuccess: () => { setCatForm(null); refresh(); },
  });
  const removeCat = useMutation({
    mutationFn: (id: string) => api(`/tags/categories/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const saveTag = useMutation({
    mutationFn: (f: TagForm) =>
      api(f.id ? `/tags/${f.id}` : '/tags', {
        method: f.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: f.name, categoryId: f.categoryId }),
      }),
    onSuccess: () => { setTagForm(null); refresh(); },
  });
  const removeTag = useMutation({
    mutationFn: (id: string) => api(`/tags/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const cats = list.data || [];

  return (
    <AppShell
      title="Теги"
      subtitle="Метки для кандидатов, сгруппированные по категориям: «Навыки», «Источник», «Приоритет» и т.п."
      actions={
        <>
          <Button variant="ghost" onClick={() => setCatForm({ name: '', allowMultiple: true })}>
            <Icon name="plus" className="w-4 h-4" /> Категория
          </Button>
          <Button onClick={() => setTagForm({ name: '', categoryId: cats[0]?.id || '' })} disabled={!cats.length}>
            <Icon name="plus" className="w-4 h-4" /> Тег
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorText error={removeCat.error || removeTag.error} />
        {cats.map((cat: any) => (
          <Card key={cat.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="font-bold">{cat.name}</div>
                <div className="text-xs text-[var(--sk-muted)]">
                  {cat.allowMultiple ? 'Кандидату можно поставить несколько тегов' : 'Только один тег на кандидата'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setTagForm({ name: '', categoryId: cat.id })}>
                  <Icon name="plus" className="w-4 h-4" /> Тег
                </Button>
                <button
                  type="button"
                  className="sk-btn sk-btn-icon"
                  title="Изменить категорию"
                  aria-label="Изменить категорию"
                  onClick={() => setCatForm({ id: cat.id, name: cat.name, allowMultiple: cat.allowMultiple })}
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
                <ConfirmDelete iconOnly label="Удалить категорию" question="Удалить категорию?" onConfirm={() => removeCat.mutate(cat.id)} pending={removeCat.isPending} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(cat.tags || []).map((t: any) => (
                <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--sk-line-strong)] pl-3 pr-1 py-0.5 text-[13px]">
                  {t.name}
                  {t._count?.candidates ? <span className="text-xs text-[var(--sk-muted)]">· {t._count.candidates}</span> : null}
                  <button
                    type="button"
                    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--sk-hover)]"
                    title="Изменить тег"
                    aria-label={`Изменить тег ${t.name}`}
                    onClick={() => setTagForm({ id: t.id, name: t.name, categoryId: cat.id })}
                  >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              {!cat.tags?.length ? <span className="text-sm text-[var(--sk-muted)]">В категории пока нет тегов</span> : null}
            </div>
          </Card>
        ))}
        {!list.isLoading && !cats.length ? (
          <Card className="p-8 text-center">
            <div className="font-semibold">Категорий пока нет</div>
            <div className="text-sm text-[var(--sk-muted)] mt-1">Создайте категорию, например «Навыки», и добавьте в неё теги</div>
            <Button className="mt-4" onClick={() => setCatForm({ name: '', allowMultiple: true })}>
              <Icon name="plus" className="w-4 h-4" /> Категория
            </Button>
          </Card>
        ) : null}
      </div>

      <Modal open={!!catForm} title={catForm?.id ? 'Изменить категорию' : 'Новая категория'} onClose={() => setCatForm(null)}>
        {catForm ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveCat.mutate(catForm); }}>
            <Field label="Название">
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="Например: Навыки" required />
            </Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={catForm.allowMultiple} onChange={(e) => setCatForm({ ...catForm, allowMultiple: e.target.checked })} />
              Можно поставить кандидату несколько тегов из этой категории
            </label>
            <ErrorText error={saveCat.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCatForm(null)}>Отмена</Button>
              <Button type="submit" disabled={saveCat.isPending}>Сохранить</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!tagForm} title={tagForm?.id ? 'Изменить тег' : 'Новый тег'} onClose={() => setTagForm(null)}>
        {tagForm ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveTag.mutate(tagForm); }}>
            <Field label="Название">
              <Input value={tagForm.name} onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })} placeholder="Например: Водитель категории C" required />
            </Field>
            <Field label="Категория">
              <Select value={tagForm.categoryId} onChange={(e) => setTagForm({ ...tagForm, categoryId: e.target.value })} required>
                {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <ErrorText error={saveTag.error} />
            <div className="flex justify-between gap-2">
              {tagForm.id ? (
                <ConfirmDelete
                  question="Удалить тег? У кандидатов он тоже исчезнет."
                  onConfirm={() => { removeTag.mutate(tagForm.id!); setTagForm(null); }}
                  pending={removeTag.isPending}
                />
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setTagForm(null)}>Отмена</Button>
                <Button type="submit" disabled={saveTag.isPending}>Сохранить</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </AppShell>
  );
}
