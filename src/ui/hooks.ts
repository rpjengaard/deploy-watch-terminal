import { useEffect, useRef, useState, useCallback } from 'react';
import type { ProjectData } from '../model.ts';
import { anyActive } from '../model.ts';
import { nextInterval } from '../poll.ts';
import { AuthError } from '../auth.ts';
import { bell, describe, diffTransitions, notifyMac } from '../notify.ts';

export interface Source {
  fetchAll(): Promise<ProjectData[]>;
}

export interface PollState {
  projects: ProjectData[];
  lastRefresh?: number;
  interval: number;
  loading: boolean;
  error?: string;
  authError?: string;
  refresh: () => void;
}

export function usePoll(source: Source, opts: { quiet: boolean }): PollState {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [lastRefresh, setLastRefresh] = useState<number>();
  const [interval, setIntervalMs] = useState(nextInterval(false));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [authError, setAuthError] = useState<string>();
  const prev = useRef<ProjectData[] | undefined>(undefined);
  const hasPrev = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = await source.fetchAll();
      const transitions = diffTransitions(hasPrev.current ? prev.current : undefined, next);
      if (!opts.quiet) {
        for (const tr of transitions) {
          const { title, body } = describe(tr);
          bell();
          notifyMac(title, body);
        }
      }
      prev.current = next;
      hasPrev.current = true;
      setProjects(next);
      setError(undefined);
      setAuthError(undefined);
      setLastRefresh(Date.now());
      setIntervalMs(nextInterval(anyActive(next)));
    } catch (e) {
      if (e instanceof AuthError) setAuthError(e.message);
      else setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [source, opts.quiet]);

  const schedule = useCallback(
    (ms: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        await tick();
        schedule(nextInterval(anyActive(prev.current ?? [])));
      }, ms);
    },
    [tick],
  );

  useEffect(() => {
    void tick().then(() => schedule(nextInterval(anyActive(prev.current ?? []))));
    return () => clearTimeout(timer.current);
  }, [tick, schedule]);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    void tick().then(() => schedule(nextInterval(anyActive(prev.current ?? []))));
  }, [tick, schedule]);

  return { projects, lastRefresh, interval, loading, error, authError, refresh };
}

/** Re-render every second so relative times/durations tick. */
export function useClock(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
