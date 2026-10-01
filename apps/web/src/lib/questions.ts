export type QuestionType = 'text' | 'textarea' | 'number' | 'single' | 'multi' | 'yesno' | 'scale';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Короткий ответ',
  textarea: 'Развёрнутый ответ',
  number: 'Число',
  single: 'Один вариант из списка',
  multi: 'Несколько вариантов',
  yesno: 'Да / Нет',
  scale: 'Оценка от 1 до 5',
};

const KNOWN = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

export function normalizeQuestions(schema: any): Question[] {
  const raw = Array.isArray(schema?.questions)
    ? schema.questions
    : Array.isArray(schema?.prompts)
      ? schema.prompts.map((text: string) => ({ text, type: 'textarea' }))
      : [];
  return raw.map((q: any, i: number) => {
    const t = q?.type === 'boolean' ? 'yesno' : q?.type;
    const type: QuestionType = KNOWN.includes(t) ? t : 'text';
    return {
      id: String(q?.id || `q${i + 1}`),
      text: String(q?.text || ''),
      type,
      required: !!q?.required,
      options: Array.isArray(q?.options) ? q.options.map(String) : undefined,
    };
  });
}

export function newQuestionId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function formatAnswer(q: Question, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (q.type === 'yesno') return value === true || value === 'yes' ? 'Да' : value === false || value === 'no' ? 'Нет' : String(value);
  if (q.type === 'scale') return `${value} из 5`;
  return String(value);
}

export function questionWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'вопрос';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'вопроса';
  return 'вопросов';
}
