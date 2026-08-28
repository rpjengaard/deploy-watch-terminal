import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import Spinner from 'ink-spinner';
import { spawn } from 'node:child_process';
import type { Approver } from '../ado.ts';
import type { Track, Stage } from '../model.ts';
import { activeTracks } from '../model.ts';
import { relative } from '../time.ts';
import { useClock, usePoll, type Source } from './hooks.ts';
import { ActivePane, ProjectPane } from './components.tsx';

const MIN_COL_WIDTH = 70;
const ACTIVE_VIEW = 0;

interface Confirm {
  action: 'approve' | 'reject';
  track: Track;
  stage: Stage;
}

interface Message {
  text: string;
  color: string;
  until: number;
}

export function App({ source, approver, quiet, org }: { source: Source; approver?: Approver; quiet: boolean; org: string }) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns, rows } = useWindowSize();
  const now = useClock();
  const poll = usePoll(source, { quiet });

  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>();
  const [message, setMessage] = useState<Message>();
  const [view, setView] = useState(ACTIVE_VIEW);

  const projects = poll.projects;
  // Column layout: all projects side by side when they fit; otherwise one project per view.
  const columnMode = projects.length <= 2 && columns >= MIN_COL_WIDTH * Math.max(1, projects.length);
  const viewCount = 1 + (columnMode ? 1 : projects.length); // view 0 = active deploys
  const visibleProjects = view === ACTIVE_VIEW ? [] : columnMode ? projects : projects.slice(view - 1, view);
  const active = useMemo(() => activeTracks(projects), [projects]);
  const tracks = useMemo(
    () => (view === ACTIVE_VIEW ? active : visibleProjects.flatMap((p) => [...p.pipelines, ...p.releases])),
    [view, active, visibleProjects],
  );
  const current = tracks[Math.min(selected, Math.max(0, tracks.length - 1))];

  useEffect(() => {
    if (selected >= tracks.length) setSelected(Math.max(0, tracks.length - 1));
  }, [tracks.length, selected]);
  useEffect(() => {
    if (view >= viewCount) setView(Math.max(0, viewCount - 1));
  }, [view, viewCount]);

  const say = (text: string, color = 'green', ms = 6000) => setMessage({ text, color, until: Date.now() + ms });
  const pendingStage = (t?: Track) => t?.latest?.stages.find((s) => s.status === 'pending-approval' && s.approvalId);
  const goView = (v: number, sel = 0) => {
    setView(((v % viewCount) + viewCount) % viewCount);
    setSelected(sel);
  };

  useInput(
    (input, key) => {
      if (confirm) {
        if (input === 'y' || input === 'Y') {
          const c = confirm;
          setConfirm(undefined);
          if (!approver) return say('no approver available (mock mode)', 'yellow');
          const fn = c.action === 'approve' ? approver.approve : approver.reject;
          say(`${c.action === 'approve' ? 'Approving' : 'Rejecting'} ${c.track.latest?.name} → ${c.stage.name}…`, 'yellow');
          fn
            .call(approver, c.track.projectName, c.stage.approvalId!)
            .then(() => {
              say(`${c.action === 'approve' ? 'Approved' : 'Rejected'} ${c.track.latest?.name} → ${c.stage.name}`);
              poll.refresh();
            })
            .catch((e: Error) => say(`${c.action} failed: ${e.message}`, 'red', 15000));
        } else {
          setConfirm(undefined);
          say('cancelled', 'gray', 2000);
        }
        return;
      }
      if (input === 'q' || (key.ctrl && input === 'c')) return exit();
      if (input === 'r') return poll.refresh();
      if (input === 'j' || key.downArrow) return setSelected((s) => Math.min(tracks.length - 1, s + 1));
      if (input === 'k' || key.upArrow) return setSelected((s) => Math.max(0, s - 1));
      if (key.return || input === ' ' || input === '\n' || input === '\r') {
        if (!current) return;
        setExpanded((e) => {
          const n = new Set(e);
          n.has(current.key) ? n.delete(current.key) : n.add(current.key);
          return n;
        });
        return;
      }
      if (input === 'o') {
        const url = current?.latest?.url;
        if (url) {
          spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
          say(`opened ${current!.latest!.name}`, 'gray', 2000);
        }
        return;
      }
      if (input === 'a' || input === 'x') {
        const stage = pendingStage(current);
        if (!current || !stage) return say('selected item has no pending approval', 'yellow', 3000);
        setConfirm({ action: input === 'a' ? 'approve' : 'reject', track: current, stage });
        return;
      }
      if (/^[0-9]$/.test(input)) {
        const n = Number(input);
        if (n < viewCount) goView(n);
        return;
      }
      if (key.tab) return goView(view + 1);
      const dir = key.rightArrow || input === 'l' ? 1 : key.leftArrow || input === 'h' ? -1 : 0;
      if (!dir) return;
      if (columnMode && view !== ACTIVE_VIEW) {
        // jump to the neighbouring pane, keeping the same row position; fall off the edges into the active view
        const sizes = visibleProjects.map((p) => p.pipelines.length + p.releases.length);
        let pi = 0,
          off = 0;
        while (pi < sizes.length - 1 && selected >= off + sizes[pi]!) off += sizes[pi++]!;
        const target = pi + dir;
        if (target < 0 || target >= sizes.length) return goView(ACTIVE_VIEW);
        const within = selected - off;
        const targetOff = sizes.slice(0, target).reduce((a, b) => a + b, 0);
        setSelected(targetOff + Math.min(within, Math.max(0, sizes[target]! - 1)));
        return;
      }
      if (columnMode && view === ACTIVE_VIEW && dir === 1) {
        // enter the projects view on its first pane
        return goView(1, 0);
      }
      if (columnMode && view === ACTIVE_VIEW && dir === -1) {
        // wrap to the last pane of the projects view
        const sizes = projects.map((p) => p.pipelines.length + p.releases.length);
        const last = sizes.length - 1;
        return goView(1, sizes.slice(0, last).reduce((a, b) => a + b, 0));
      }
      goView(view + dir);
    },
    { isActive: isRawModeSupported },
  );

  const colWidth = Math.floor(columns / Math.max(1, visibleProjects.length));
  const activeMsg = message && message.until > now ? message : undefined;
  const pendingCount = active.filter((t) => t.latest?.status === 'pending-approval').length;

  const tabLabels: { label: React.ReactNode; on: boolean }[] = [
    {
      on: view === ACTIVE_VIEW,
      label: (
        <Text>
          0:active{active.length ? ` ${active.length}` : ''}
          {pendingCount ? <Text color="yellow"> ⏸{pendingCount}</Text> : null}
        </Text>
      ),
    },
    ...(columnMode
      ? [{ on: view !== ACTIVE_VIEW, label: <Text>1:{projects.map((p) => p.key).join(' · ')}</Text> }]
      : projects.map((p, i) => ({
          on: view === i + 1,
          label: (
            <Text>
              {i + 1}:{p.key}
            </Text>
          ),
        }))),
  ];

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {/* header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text>
          <Text bold color="cyan">
            deploy-watch
          </Text>
          <Text dimColor> · {org} </Text>
          {tabLabels.map((t, i) => (
            <Text key={i} inverse={t.on} dimColor={!t.on} bold={t.on}>
              {' '}
              {t.label}{' '}
            </Text>
          ))}
        </Text>
        <Text dimColor>
          {poll.loading ? (
            <Text color="cyan">
              <Spinner type="dots" />{' '}
            </Text>
          ) : (
            '⟳ '
          )}
          every {poll.interval / 1000}s
          {poll.lastRefresh ? ` · updated ${relative(new Date(poll.lastRefresh).toISOString(), now)}` : ''}
          {quiet ? ' · quiet' : ''}
        </Text>
      </Box>
      {poll.authError && (
        <Box paddingX={1}>
          <Text backgroundColor="red" color="white" bold>
            {' '}
            AUTH FAILED: {poll.authError}{' '}
          </Text>
        </Box>
      )}
      {poll.error && !poll.authError && (
        <Box paddingX={1}>
          <Text color="red">⚠ {poll.error}</Text>
        </Box>
      )}

      {/* body */}
      <Box flexGrow={1} flexDirection="row">
        {projects.length === 0 ? (
          <Box padding={1}>
            <Text dimColor>
              <Spinner type="dots" /> loading…
            </Text>
          </Box>
        ) : view === ACTIVE_VIEW ? (
          <ActivePane tracks={active} width={columns} selectedKey={current?.key} expanded={expanded} now={now} />
        ) : (
          visibleProjects.map((p) => (
            <ProjectPane key={p.key} project={p} width={colWidth} selectedKey={current?.key} expanded={expanded} now={now} active />
          ))
        )}
      </Box>

      {/* footer */}
      <Box paddingX={1} justifyContent="space-between">
        {confirm ? (
          <Text>
            <Text backgroundColor="yellow" color="black" bold>
              {' '}
              {confirm.action === 'approve' ? 'Approve' : 'Reject'} {confirm.track.latest?.name} → {confirm.stage.name}? [y/N]{' '}
            </Text>
          </Text>
        ) : activeMsg ? (
          <Text color={activeMsg.color}>{activeMsg.text}</Text>
        ) : (
          <Text dimColor>j/k move · h/l/tab/0-9 view · enter expand · o open · a approve · x reject · r refresh · q quit</Text>
        )}
        {pendingStage(current) && !confirm && (
          <Text color="yellow" bold>
            ⏸ approval pending — press a
          </Text>
        )}
      </Box>
    </Box>
  );
}
