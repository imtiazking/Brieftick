'use client';

import { useState, useTransition } from 'react';
import { submitAskRiQuestionAction } from '@/lib/ri/server-actions-ask-ri';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import Link from 'next/link';

type AskResult = {
  question: string;
  interpretedAs: string;
  status: string;
  answer: string;
  records: { id: string; type: string; reason: string | null }[];
  recordCount: number;
};

export function AskRiPanel({ examples }: { examples: string[] }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function hrefForRecord(type: string, id: string) {
    const t = type.toLowerCase();
    if (t.includes('obligation')) return `/ri/obligations/${id}`;
    if (t.includes('change')) return `/ri/changes/${id}`;
    if (t.includes('action')) return `/ri/actions/${id}`;
    if (t.includes('control')) return `/ri/controls/${id}`;
    if (t.includes('evidence')) return `/ri/evidence/${id}`;
    if (t.includes('publication')) return `/ri/publications/${id}`;
    return null;
  }

  return (
    <div className="fg-stack">
      <div className="fg-card">
        <p className="fg-muted">
          Ask RI is not a generic chatbot. Answers are grounded in deterministic query plans over your
          organisation&apos;s RI data. AI may assist wording in future; record membership and counts are
          always computed server-side.
        </p>
        <form
          className="ri-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData();
            fd.set('question', question);
            startTransition(async () => {
              const res = await submitAskRiQuestionAction(fd);
              if (!res.ok || !res.result) {
                setError(res.error || 'request_failed');
                setResult(null);
                return;
              }
              setResult(res.result as AskResult);
            });
          }}
        >
          <label>
            Question
            <textarea
              name="question"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about obligations, changes, evidence, deadlines…"
            />
          </label>
          <button type="submit" className="fg-btn fg-btn--primary" disabled={pending || !question.trim()}>
            {pending ? 'Running…' : 'Ask'}
          </button>
        </form>
        <p className="fg-muted fg-text-sm">Examples:</p>
        <ul className="fg-muted">
          {examples.map((ex) => (
            <li key={ex}>
              <button type="button" className="fg-link-btn" onClick={() => setQuestion(ex)}>
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error ? <div className="fg-banner fg-banner--warn">{error}</div> : null}

      {result ? (
        <div className="fg-card">
          <p><strong>Interpreted as:</strong> {result.interpretedAs}</p>
          <p><RiStatusChip label={result.status} /></p>
          <p>{result.answer}</p>
          {result.records.length > 0 ? (
            <table className="fg-table">
              <thead>
                <tr><th>Type</th><th>Record</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {result.records.slice(0, 50).map((r) => {
                  const href = hrefForRecord(r.type, r.id);
                  return (
                    <tr key={`${r.type}-${r.id}`}>
                      <td>{r.type}</td>
                      <td className="ri-mono">
                        {href ? <Link href={href}>{r.id}</Link> : r.id}
                      </td>
                      <td className="fg-muted">{r.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
