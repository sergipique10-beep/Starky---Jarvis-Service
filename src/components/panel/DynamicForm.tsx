'use client';

import { useState } from 'react';
import styles from './DynamicForm.module.css';

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; format?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
}

export default function DynamicForm({
  schema,
  onSubmit,
  submitLabel,
  disabled,
}: {
  schema: ToolInputSchema;
  onSubmit: (values: Record<string, unknown>) => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = Object.entries(schema.properties);
  const required = new Set(schema.required ?? []);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    const result: Record<string, unknown> = {};
    for (const [key, field] of fields) {
      const raw = values[key];
      if (!raw) continue; // omit empty optional fields
      result[key] = field.type === 'array' ? raw.split(',').map((s) => s.trim()) : raw;
    }
    onSubmit(result);
  }

  return (
    <div className={styles.form}>
      {fields.map(([key, field]) => (
        <div key={key} className={styles.field}>
          <div className={styles.label}>
            <label htmlFor={key}>{key}</label>
            {required.has(key) && <span aria-hidden="true"> *</span>}
          </div>
          {field.enum ? (
            <select
              id={key}
              className={styles.select}
              value={values[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            >
              {!required.has(key) && (
                <option value="" disabled>
                  Elegir…
                </option>
              )}
              {field.enum.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={key}
              className={styles.input}
              type={field.format === 'date-time' ? 'datetime-local' : 'text'}
              value={values[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            />
          )}
        </div>
      ))}
      <button className={styles.submit} onClick={submit} disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  );
}
