import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startProcess, stopProcess } from '../../scripts/browser-process.mjs';

async function isRunning(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const status = await readFile(`/proc/${pid}/stat`, 'utf8');
      return status.slice(status.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
    }
    return true;
  } catch (error) {
    if (['ESRCH', 'ENOENT'].includes(error.code)) return false;
    throw error;
  }
}

async function withProcess(source, check, command = process.execPath) {
  const directory = await mkdtemp(join(tmpdir(), 'dakly-process-'));
  const running = startProcess(command, ['-e', source], {
    cwd: directory,
    env: { ...process.env, PROCESS_EVIDENCE: directory },
    log: join(directory, 'process.log'),
  });
  try {
    await check(running, directory);
  } finally {
    await stopProcess(running);
    // The fixture watchdog also bounds cleanup against the deliberately broken implementation.
    await running.done;
    const descendant = await readFile(join(directory, 'descendant'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (descendant)
      await expect
        .poll(() => isRunning(Number(descendant)), { timeout: 4500, interval: 25 })
        .toBe(false);
    await rm(directory, { recursive: true, force: true });
  }
}

const descendant = `
  require('node:fs').writeFileSync(process.env.PROCESS_EVIDENCE + '/descendant', String(process.pid));
  setTimeout(() => process.exit(0), 4000);
`;
const launchDescendant = (stdio = 'inherit') => `
  require('node:fs').writeFileSync(process.env.PROCESS_EVIDENCE + '/leader', String(process.pid));
  require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: '${stdio}' });
`;

async function processId(directory, name = 'descendant') {
  let pid;
  await expect
    .poll(async () => {
      try {
        pid = Number(await readFile(join(directory, name), 'utf8'));
        return pid > 0;
      } catch {
        return false;
      }
    })
    .toBe(true);
  return pid;
}

describe('browser process ownership', () => {
  it('stops an active command and its descendant during cancellation', async () => {
    await withProcess(
      `${launchDescendant()}; setTimeout(() => process.exit(0), 4000);`,
      async (running, directory) => {
        const pid = await processId(directory);
        expect(await isRunning(pid)).toBe(true);
        await stopProcess(running);
        await expect.poll(() => isRunning(pid), { timeout: 1000 }).toBe(false);
      },
    );
  });

  it.each(['inherit', 'ignore'])(
    'stops descendants with %s stdio after their command leader has exited',
    async (stdio) => {
      await withProcess(
        `${launchDescendant(stdio)}; process.exit(0);`,
        async (running, directory) => {
          const pid = await processId(directory);
          expect(await isRunning(pid)).toBe(true);
          // A completed command can still leave a live descendant holding its stdout pipe.
          const leader = await processId(directory, 'leader');
          await expect.poll(() => isRunning(leader)).toBe(false);
          await stopProcess(running);
          await expect.poll(() => isRunning(pid), { timeout: 1000 }).toBe(false);
        },
      );
    },
  );

  it('cleans its group when the controller IPC connection disappears', async () => {
    await withProcess(
      `${launchDescendant()}; setTimeout(() => process.exit(0), 4000);`,
      async (running, directory) => {
        const pid = await processId(directory);
        running.child.disconnect();
        await running.ownerClosed;
        await expect.poll(() => isRunning(pid), { timeout: 1000 }).toBe(false);
        expect(await isRunning(running.child.pid)).toBe(false);
      },
    );
  });

  it.each([0, 1])(
    'finishes a completed command with exit code %s and stops its owner',
    async (code) => {
      await withProcess(`process.exit(${code});`, async (running) => {
        expect(await running.done).toBe(code);
        await stopProcess(running);
        expect(await isRunning(running.child.pid)).toBe(false);
      });
    },
  );

  it('reports an unavailable executable without hanging startup or teardown', async () => {
    await withProcess(
      '',
      async (running) => {
        expect(await running.done).toBe(1);
        await stopProcess(running);
        if (running.child.pid) expect(await isRunning(running.child.pid)).toBe(false);
      },
      '/dakly-missing-test-command',
    );
  });
});
