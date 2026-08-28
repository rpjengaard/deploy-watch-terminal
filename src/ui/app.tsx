import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import Spinner from 'ink-spinner';
import { spawn } from 'node:child_process';
import type { Approver } from '../ado.ts';
import type { Track, Stage } from '../model.ts';
import { relative } from '../time.ts';
import { useClock, usePoll, type Source } from './hooks.ts';
import { ProjectPane } from './components.tsx';

const MIN_COL_WIDTH = 70;

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
  const [tab, setTab] = useState(0);

  const useTabs = poll.projects.length > 2 || columns < MIN_COL_WIDTH * Math.max(1, poll.projects.length);
  const visibleProjects = useTabs ? poll.projects.slice(tab, tab + 1) : poll.projects;
  const tracks = useMemo(() => visibleProjects.flatMap((p) => [...p.pipelines, ...p.releases]), [visibleProjects]);
  const current = tracks[Math.min(selected, Math.max(0, tracks.length - 1))];

  useEffect(() => {
    if (selected >= tracks.length) setSelected(Math.max(0, tracks.length - 1));
  }, [tracks.length, selected]);

  const say = (text: string, color = 'green', ms = 6000) => setMessage({ text, color, until: Date.now() + ms });
  const pendingStage = (t?: Track) => t?.latest?.stages.find((s) => s.status === 'pending-approval' && s.approvalId);

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
      const dir = key.rightArrow || input === 'l' || key.tab ? 1 : key.leftArrow || input === 'h' ? -1 : 0;
      if (dir && !useTabs) {
        // jump to the neighbouring pane, keeping the same row position where possible
        const sizes = visibleProjects.map((p) => p.pipelines.length + p.releases.length);
        let pi = 0, off = 0;
        while (pi < sizes.length - 1 && selected >= off + sizes[pi]!) off += sizes[pi++]!;
        const within = selected - off;
        const target = (pi + dir + sizes.length) % sizes.length;
        const targetOff = sizes.slice(0, target).reduce((a, b) => a + b, 0);
        setSelected(targetOff + Math.min(within, Math.max(0, sizes[target]! - 1)));
        return;
      }
      if (useTabs) {
        if (dir) {
          setTab((t) => (t + dir + poll.projects.length) % poll.projects.length);
          setSelected(0);
        }
        const n = Number(input);
        if (n >= 1 && n <= poll.projects.length) {
          setTab(n - 1);
          setSelected(0);
        }
      }
    },
    { isActive: isRawModeSupported },
  );

  const colWidth = Math.floor(columns / Math.max(1, visibleProjects.length));
  const activeMsg = message && message.until > now ? message : undefined;

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {/* header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text>
          <Text bold color="cyan">
            deploy-watch
          </Text>
          <Text dimColor> · {org}</Text>
          {useTabs && (
            <Text>
              {'  '}
              {poll.projects.map((p, i) => (
                <Text key={p.key} inverse={i === tab} dimColor={i !== tab}>
                  {' '}
                  {i + 1}:{p.key}{' '}
                </Text>
              ))}
            </Text>
          )}
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
        {poll.projects.length === 0 && (
          <Box padding={1}>
            <Text dimColor>
              <Spinner type="dots" /> loading…
            </Text>
          </Box>
        )}
        {visibleProjects.map((p) => (
          <ProjectPane key={p.key} project={p} width={colWidth} selectedKey={current?.key} expanded={expanded} now={now} active />
        ))}
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
          <Text dimColor>
            j/k move · h/l pane · enter expand · o open · a approve · x reject · r refresh · q quit
            {useTabs ? ' · tab/1-9 project' : ''}
          </Text>
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
