import { spawn } from 'node:child_process';
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
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let remaining = 1024 * 1024;
  const write = (chunk) => {
    if (remaining > 0) writeSync(descriptor, chunk.subarray(0, remaining));
    remaining = Math.max(0, remaining - chunk.length);
  };
  child.stdout.on('data', write);
  child.stderr.on('data', write);
  const done = new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('close', (code) => {
      closeSync(descriptor);
      resolve(code ?? 1);
    });
  });
  return { child, done };
}

export async function waitForHealth(url, processes, signal) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (processes.some(({ child }) => child.exitCode !== null || child.signalCode !== null))
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

export async function stopProcess({ child, done }) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  kill('SIGTERM');
  const stopped = await Promise.race([
    done.then(() => true),
    delay(10000, undefined, { ref: false }).then(() => false),
  ]);
  if (!stopped) {
    kill('SIGKILL');
    await done;
  }
}
