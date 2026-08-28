import { describe, expect, test } from 'bun:test';
import { duration, relative } from '../time.ts';
import { nextInterval, ACTIVE_INTERVAL, IDLE_INTERVAL } from '../poll.ts';

const now = Date.parse('2026-08-28T12:00:00Z');
const ago = (s: number) => new Date(now - s * 1000).toISOString();

describe('relative', () => {
  test('buckets', () => {
    expect(relative(ago(5), now)).toBe('5s ago');
    expect(relative(ago(65), now)).toBe('1m ago');
    expect(relative(ago(3700), now)).toBe('1h ago');
    expect(relative(ago(90000), now)).toBe('1d ago');
    expect(relative(undefined, now)).toBe('');
  });
});

describe('duration', () => {
  test('formats', () => {
    expect(duration(ago(30), undefined, now)).toBe('30s');
    expect(duration(ago(125), undefined, now)).toBe('2m05s');
    expect(duration(ago(3661), undefined, now)).toBe('1h01m');
    expect(duration(ago(100), ago(40), now)).toBe('1m00s');
  });
});

describe('nextInterval', () => {
  test('adaptive', () => {
    expect(nextInterval(true)).toBe(ACTIVE_INTERVAL);
    expect(nextInterval(false)).toBe(IDLE_INTERVAL);
  });
});
