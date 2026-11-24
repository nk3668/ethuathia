import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatComparison,
  makeReport,
  parseReport,
  parseReportText,
  resolveCompareRef,
  simArgv,
  staleBaseWarning,
} from '../../tools/compare';
import { formatReport, headlessParty, runSeeds } from '../../tools/headless';
import type { SeedResult } from '../../tools/headless';

const ARGS = { from: 1, seeds: 3, cap: 1000, party: 4 };

function gitIn(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error !== undefined) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function commitFile(cwd: string, name: string, content: string): string {
  writeFileSync(join(cwd, name), content);
  gitIn(cwd, ['add', name]);
  gitIn(cwd, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-m', name]);
  return gitIn(cwd, ['rev-parse', 'HEAD']);
}

describe('tools/compare', () => {
  it('reads the printed report table back, for refs from before --json', () => {
    const results = runSeeds(1, 3, { depth: 2, party: headlessParty(4) });
    const parsed = parseReportText(formatReport(results));
    expect(parsed.map((r) => [r.seed, r.turns, r.depth, r.bottom, r.outcome, r.stuck.count, r.hash])).toEqual(
      results.map((r) => [r.seed, r.turns, r.depth, r.bottom, r.outcome, r.stuck.count, r.hash]),
    );
    // Tables from before ETH-058 have no depth column.
    expect(parseReportText('   7    212    100.0%      -  done    0abc')).toEqual([
      expect.objectContaining({ seed: 7, turns: 212, outcome: 'done', hash: '0abc' }),
    ]);
    expect(parseReportText('   7    212    100.0%      -  done    0abc')[0]?.depth).toBeUndefined();
    expect(parsed[0]?.explored.fraction).toBeCloseTo(results[0]?.explored.fraction ?? 0, 3);
  });

  it('round-trips a JSON report and rejects anything else', () => {
    const report = makeReport(ARGS, runSeeds(1, 2, { depth: 2, party: headlessParty(4) }));
    expect(parseReport(JSON.stringify(report), 'r.json')).toEqual(report);
    expect(() => parseReport('{"version":99}', 'old.json')).toThrow('old.json is not a sim report');
    expect(() => parseReport('nope', 'bad.json')).toThrow('bad.json is not JSON');
  });

  it('prints before, after and delta per metric, and which seeds changed', () => {
    const before = makeReport(ARGS, runSeeds(1, 3, { depth: 2, party: headlessParty(4) }));
    const same = formatComparison(before, before);
    expect(same).toMatch(/^metric\s+before\s+after\s+delta/);
    expect(same).toMatch(/runs\s+3\s+3\s+0/);
    expect(same).toMatch(/depth, mean\s+2\.00\s+2\.00\s+0/);
    expect(same).toContain('all 3 shared seeds end the same');

    const slower: SeedResult[] = before.results.map((r) => (r.seed === 2 ? { ...r, turns: r.turns + 50, hash: 'changed' } : r));
    const text = formatComparison(before, makeReport(ARGS, slower));
    expect(text).toMatch(/turns, mean \(done\)\s+[\d.]+\s+[\d.]+\s+\+16\.7 \(\+\d+\.\d%\)/);
    expect(text).toContain('1 of 3 shared seeds end differently: 2.');

    // Reports from different arguments are not comparable: an error, not a note.
    expect(() => formatComparison(before, makeReport({ ...ARGS, cap: 500 }, before.results))).toThrow(/different arguments/);
    expect(() => formatComparison(before, makeReport({ ...ARGS, preset: 'progressed' }, before.results))).toThrow(/different arguments/);
    const withWarning = formatComparison(before, before, undefined, ['Warning: stale base']);
    expect(withWarning).toContain('Warning: stale base');
  });

  it('forwards every report argument to the ref, leaving out defaults', () => {
    expect(simArgv(ARGS)).toEqual(['--seeds', '3', '--from', '1', '--cap', '1000', '--party', '4']);
    expect(simArgv({ ...ARGS, preset: 'progressed', upgrades: ['upgrade.a', 'upgrade.b'], rules: 'cautious' })).toEqual([
      '--seeds', '3', '--from', '1', '--cap', '1000', '--party', '4',
      '--preset', 'progressed', '--upgrades', 'upgrade.a,upgrade.b', '--rules', 'cautious',
    ]);
    expect(simArgv({ ...ARGS, preset: 'fresh', upgrades: [], rules: 'baseline' })).toEqual(simArgv(ARGS));
    expect(simArgv({ ...ARGS, recruits: true })).toEqual([...simArgv(ARGS), '--recruits']);
    expect(makeReport({ ...ARGS, recruits: true }, []).args.recruits).toBe(true);
    expect(makeReport(ARGS, []).args).not.toHaveProperty('recruits');
  });

  it('compares banked Renown per hour before and after, and prints - for older reports without it (ETH-085)', () => {
    const before = makeReport(ARGS, runSeeds(1, 3, { depth: 2, party: headlessParty(4) }));
    const doubled: SeedResult[] = before.results.map((r) => ({
      ...r,
      atRisk: { ...r.atRisk, renown: (r.atRisk?.renown ?? 0) * 2 },
      lost: { ...r.lost, renown: (r.lost?.renown ?? 0) * 2 },
    }));
    const diff = formatComparison(before, makeReport(ARGS, doubled));
    expect(diff).toMatch(/renown\/hr \(1x\), banked\s+[\d.]+\s+[\d.]+\s+\+[\d.]+ \(\+100\.0%\)/);

    const legacy = makeReport(ARGS, parseReportText(formatReport(before.results)));
    const fromLegacy = formatComparison(legacy, before);
    expect(fromLegacy).toMatch(/renown\/hr \(1x\), banked\s+-\s+[\d.]+\s+-/);
    expect(fromLegacy).toMatch(/party level, median\s+-\s+[\d.]+\s+-/);
    expect(fromLegacy).toMatch(/win rate %\s+[\d.]+\s+[\d.]+\s+/);

    // Pre-summary JSON reports (e.g. origin/main) parse cleanly and leave default args unmodified.
    const originJson = JSON.stringify({ version: 1, args: ARGS, results: before.results });
    const parsedOrigin = parseReport(originJson, 'origin.json');
    expect(parsedOrigin.args).toEqual(ARGS);
    expect(formatComparison(parsedOrigin, before)).toContain('all 3 shared seeds end the same');
  });

  it('formats stale-base warnings only when ahead of the merge base', () => {
    expect(staleBaseWarning('origin/main', 0, 'abcdef1234567')).toBeNull();
    expect(staleBaseWarning('origin/main', 1, 'abcdef1234567')).toBe(
      'Warning: origin/main is 1 commit ahead of merge-base abcdef1, so hash diffs may include changes from origin/main. Rebase onto origin/main or run with --compare merge-base.',
    );
    expect(staleBaseWarning('origin/main', 3, 'abcdef1234567')).toContain('origin/main is 3 commits ahead of merge-base abcdef1');
  });

  it('warns when the compare ref moved since the branch was cut, and resolves --compare merge-base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eth-compare-'));
    try {
      gitIn(dir, ['init']);
      gitIn(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      const shaA = commitFile(dir, 'a.txt', 'a');
      gitIn(dir, ['checkout', '-b', 'feat']);
      commitFile(dir, 'b.txt', 'b');
      gitIn(dir, ['checkout', 'main']);
      commitFile(dir, 'c.txt', 'c');
      const shaD = commitFile(dir, 'd.txt', 'd');
      gitIn(dir, ['checkout', 'feat']);

      const staleMain = resolveCompareRef('main', dir);
      expect(staleMain).toMatchObject({ ref: 'main', sha: shaD, label: 'main', mergeBase: shaA, ahead: 2 });
      expect(staleMain.warning).toContain(`main is 2 commits ahead of merge-base ${shaA.slice(0, 7)}`);
      expect(staleMain.warning).toContain('Rebase onto main or run with --compare merge-base');

      expect(resolveCompareRef('merge-base', dir)).toEqual({
        ref: 'merge-base',
        sha: shaA,
        label: 'merge-base',
        baseRef: 'main',
        mergeBase: shaA,
        ahead: 0,
        warning: null,
      });

      gitIn(dir, ['update-ref', 'refs/remotes/origin/main', shaD]);
      const staleOrigin = resolveCompareRef('origin/main', dir);
      expect(staleOrigin.ahead).toBe(2);
      expect(staleOrigin.warning).toContain('origin/main is 2 commits ahead');
      expect(resolveCompareRef('merge-base', dir)).toMatchObject({ sha: shaA, baseRef: 'origin/main', ahead: 0, warning: null });

      gitIn(dir, ['checkout', 'main']);
      expect(resolveCompareRef('origin/main', dir)).toMatchObject({ sha: shaD, ahead: 0, warning: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
