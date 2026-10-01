'use client';

import clsx from 'clsx';
import { Input, Textarea } from '@/components/ui';
import type { Question } from '@/lib/questions';

export function QuestionField({
  question,
  value,
  onChange,
  disabled,
  index,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
  index?: number;
}) {
  const q = question;
  const options = q.options || [];
  return (
    <div>
      <div className="text-sm font-semibold mb-2">
        {index !== undefined ? <span className="text-[var(--sk-muted)] font-normal mr-1">{index + 1}.</span> : null}
        {q.text || <span className="text-[var(--sk-muted)] font-normal">Текст вопроса</span>}
        {q.required ? <span className="text-[var(--sk-danger)] ml-1" aria-label="обязательный">*</span> : null}
      </div>

      {q.type === 'textarea' ? (
        <Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Ваш ответ" disabled={disabled} />
      ) : q.type === 'number' ? (
        <Input type="number" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Число" disabled={disabled} style={{ maxWidth: 200 }} />
      ) : q.type === 'single' ? (
        <div className="flex flex-col gap-2" role="radiogroup">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={`q-${q.id}`} checked={value === o} onChange={() => onChange(o)} disabled={disabled} className="w-4 h-4" />
              {o}
            </label>
          ))}
        </div>
      ) : q.type === 'multi' ? (
        <div className="flex flex-col gap-2">
          {options.map((o) => {
            const arr: string[] = Array.isArray(value) ? value : [];
            const on = arr.includes(o);
            return (
              <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                  disabled={disabled}
                  className="w-4 h-4"
                />
                {o}
              </label>
            );
          })}
        </div>
      ) : q.type === 'yesno' ? (
        <div className="flex gap-2">
          {[
            { v: 'yes', l: 'Да' },
            { v: 'no', l: 'Нет' },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.v)}
              className={clsx('sk-btn', value === o.v ? 'sk-btn-green' : 'sk-btn-outline')}
              style={{ minWidth: 80 }}
              aria-pressed={value === o.v}
            >
              {o.l}
            </button>
          ))}
        </div>
      ) : q.type === 'scale' ? (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={clsx('sk-btn', Number(value) === n ? 'sk-btn-green' : 'sk-btn-outline')}
              style={{ width: 44, height: 44, padding: 0 }}
              aria-pressed={Number(value) === n}
              aria-label={`${n} из 5`}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Ваш ответ" disabled={disabled} />
      )}
    </div>
  );
}
