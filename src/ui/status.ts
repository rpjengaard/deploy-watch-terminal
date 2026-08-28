import type { Status } from '../model.ts';

export interface StatusStyle {
  icon: string;
  color: string;
  label: string;
  spinner?: boolean;
}

export const STATUS: Record<Status, StatusStyle> = {
  queued: { icon: '◌', color: 'cyan', label: 'queued' },
  running: { icon: '●', color: 'blue', label: 'running', spinner: true },
  'pending-approval': { icon: '⏸', color: 'yellow', label: 'awaiting approval' },
  succeeded: { icon: '✓', color: 'green', label: 'succeeded' },
  partial: { icon: '◐', color: 'yellow', label: 'partial' },
  failed: { icon: '✗', color: 'red', label: 'failed' },
  canceled: { icon: '⊘', color: 'gray', label: 'canceled' },
  skipped: { icon: '–', color: 'gray', label: 'skipped' },
  notStarted: { icon: '○', color: 'gray', label: 'not started' },
  unknown: { icon: '?', color: 'gray', label: 'unknown' },
};

export function truncate(s: string, n: number): string {
  if (n <= 0) return '';
  if (!Number.isFinite(n) || s.length <= n) return s;
  return n === 1 ? '…' : s.slice(0, n - 1) + '…';
}
