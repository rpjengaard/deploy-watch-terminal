import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ProjectData, Run, Stage, Track } from '../model.ts';
import { isActive } from '../model.ts';
import { duration, hhmm, relative } from '../time.ts';
import { STATUS, truncate } from './status.ts';

export function StatusIcon({ status, spin = true }: { status: Run['status']; spin?: boolean }) {
  const s = STATUS[status];
  if (s.spinner && spin)
    return (
      <Text color={s.color}>
        <Spinner type="dots" />
      </Text>
    );
  return <Text color={s.color}>{s.icon}</Text>;
}

export function StageChips({ stages, width }: { stages: Stage[]; width: number }) {
  // Each chip = icon + space + name; separators are " › " (3). Only truncate names when they don't fit.
  const fixed = stages.length * 2 + Math.max(0, stages.length - 1) * 3;
  const total = stages.reduce((n, s) => n + s.name.length, 0);
  const per = total + fixed <= width ? Infinity : Math.max(4, Math.floor((width - fixed) / Math.max(1, stages.length)));
  return (
    <Text wrap="truncate-end">
      {stages.map((st, i) => (
        <React.Fragment key={st.name + i}>
          {i > 0 && <Text dimColor> › </Text>}
          <Text color={STATUS[st.status].color} bold={st.status === 'pending-approval' || st.status === 'running'}>
            {STATUS[st.status].icon} {truncate(st.name, per)}
          </Text>
        </React.Fragment>
      ))}
    </Text>
  );
}

function RunMeta({ run, now, width }: { run: Run; now: number; width: number }) {
  const parts = [run.name, run.branch, run.by].filter(Boolean) as string[];
  const when = run.finished ?? run.started ?? run.queued;
  return (
    <Box justifyContent="space-between" width={width}>
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor wrap="truncate-end">
          {parts.join(' · ')}
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        <Text dimColor>
          {relative(when, now)} <Text color="gray">({hhmm(when)})</Text>
        </Text>
      </Box>
    </Box>
  );
}

function StatusLine({ run, now }: { run: Run; now: number }) {
  const s = STATUS[run.status];
  const dur = isActive(run.status)
    ? duration(run.started ?? run.queued, undefined, now)
    : duration(run.started ?? run.queued, run.finished, now);
  return (
    <Text>
      <Text color={s.color} bold={isActive(run.status)}>
        {s.label}
      </Text>
      <Text dimColor> {dur}</Text>
    </Text>
  );
}

export function HistoryRow({ run, now, width }: { run: Run; now: number; width: number }) {
  const when = run.finished ?? run.started ?? run.queued;
  return (
    <Box width={width} justifyContent="space-between">
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor wrap="truncate-end">
          <StatusIcon status={run.status} spin={false} /> {run.name}
          {run.branch ? ` · ${run.branch}` : ''} · {duration(run.started ?? run.queued, run.finished, now)}
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        <Text dimColor>
          {relative(when, now)} <Text color="gray">({hhmm(when)})</Text>
        </Text>
      </Box>
    </Box>
  );
}

export function TrackRow({
  track,
  selected,
  expanded,
  now,
  width,
}: {
  track: Track;
  selected: boolean;
  expanded: boolean;
  now: number;
  width: number;
}) {
  const run = track.latest;
  const inner = width - 4;
  const showStages = !!run && run.stages.length > 0 && (track.kind === 'release' || isActive(run.status) || expanded);
  return (
    <Box flexDirection="column" marginBottom={expanded ? 1 : 0}>
      <Box width={width} justifyContent="space-between">
        <Box flexGrow={1} flexShrink={1}>
          <Text inverse={selected} bold wrap="truncate-end">
            {selected ? '▸ ' : '  '}
            {run ? <StatusIcon status={run.status} /> : <Text dimColor>○</Text>} {track.name}
            {selected ? ' ' : ''}
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          {run ? <StatusLine run={run} now={now} /> : <Text dimColor>no runs</Text>}
        </Box>
      </Box>
      {run && (
        <Box paddingLeft={4}>
          <RunMeta run={run} now={now} width={inner} />
        </Box>
      )}
      {showStages && run && (
        <Box paddingLeft={4}>
          <StageChips stages={run.stages} width={inner} />
        </Box>
      )}
      {expanded && (
        <Box flexDirection="column" paddingLeft={4}>
          {track.history.length === 0 ? (
            <Text dimColor>no earlier runs</Text>
          ) : (
            track.history.map((h) => <HistoryRow key={h.id} run={h} now={now} width={inner} />)
          )}
        </Box>
      )}
    </Box>
  );
}

export function ProjectPane({
  project,
  width,
  selectedKey,
  expanded,
  now,
  active,
}: {
  project: ProjectData;
  width: number;
  selectedKey?: string;
  expanded: Set<string>;
  now: number;
  active: boolean;
}) {
  const inner = width - 4; // border + padding
  const section = (title: string, tracks: Track[]) => (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="magenta" bold>
        {title}
      </Text>
      {tracks.length === 0 && <Text dimColor>  none</Text>}
      {tracks.map((t) => (
        <TrackRow key={t.key} track={t} selected={t.key === selectedKey} expanded={expanded.has(t.key)} now={now} width={inner} />
      ))}
    </Box>
  );
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={active ? 'cyan' : 'gray'} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan" wrap="truncate-end">
          {project.name}
        </Text>
      </Box>
      {project.error && (
        <Text color="red" wrap="truncate-end">
          ⚠ {project.error}
        </Text>
      )}
      {section('PIPELINES', project.pipelines)}
      {section('RELEASES', project.releases)}
    </Box>
  );
}
