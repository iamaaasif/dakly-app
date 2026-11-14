import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSync, closeSync, writeSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function requireFreePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Browser test port ${port} is occupied`)));
    server.listen(port, () => server.close(resolve));
  });
}

export function startProcess(command, args, options) {
  const descriptor = openSync(options.log, 'w', 0o600);
  const owner = fileURLToPath(new URL('./browser-process-owner.mjs', import.meta.url));
  const child = spawn(process.execPath, [owner, command, ...args], {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let remaining = 1024 * 1024;
  const write = (chunk) => {
    if (remaining > 0) writeSync(descriptor, chunk.subarray(0, remaining));
    remaining = Math.max(0, remaining - chunk.length);
  };
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  const running = { child, exitCode: null };
  const done = Promise.withResolvers();
  const closed = Promise.withResolvers();
  const ownerExited = Promise.withResolvers();
  const ownerClosed = Promise.all([
    ownerExited.promise,
    new Promise((resolve) => child.stdout.once('close', resolve)),
    new Promise((resolve) => child.stderr.once('close', resolve)),
  ]).then(() => closeSync(descriptor));
  child.on('message', (message) => {
    if (message.type === 'exit') {
      running.exitCode = message.code;
      done.resolve(message.code);
    }
    if (message.type === 'closed') closed.resolve();
  });
  const finishOwner = () => {
    done.resolve(running.exitCode ?? 1);
    closed.resolve();
    ownerExited.resolve();
  };
  child.once('error', finishOwner);
  child.once('exit', finishOwner);
  return Object.assign(running, {
    done: done.promise,
    closed: closed.promise,
    ownerClosed,
  });
}

export async function waitForHealth(url, processes, signal) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (
      processes.some(
        ({ child, exitCode }) =>
          exitCode !== null || child.exitCode !== null || child.signalCode !== null,
      )
    )
      throw new Error('Browser test server exited before health check');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).status === 'ok') return;
    } catch {
      /* A booting server may not accept connections yet. */
    }
    await delay(100, undefined, { signal });
  }
  throw new Error('Browser test server health check timed out');
}

export function stopProcess(running) {
  running.stopping ??= stopOwnedGroup(running);
  return running.stopping;
}

async function stopOwnedGroup({ child, closed, ownerClosed }) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const kill = (signal) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  kill('SIGTERM');
  await Promise.race([closed, delay(10000, undefined, { ref: false })]);
  // The owner ignores TERM and still anchors the group, including descendants that closed stdio.
  kill('SIGKILL');
  await ownerClosed;
}
