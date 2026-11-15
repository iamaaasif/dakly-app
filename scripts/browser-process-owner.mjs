import { spawn } from 'node:child_process';

// Keep this group ID allocated until the controller's final group kill, even if the command exits.
process.channel.ref();
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
const stopGroup = () => process.kill(-process.pid, 'SIGKILL');
process.on('disconnect', stopGroup);
process.on('uncaughtException', stopGroup);
process.on('unhandledRejection', stopGroup);

const command = spawn(process.argv[2], process.argv.slice(3), {
  stdio: ['ignore', 'pipe', 'pipe'],
});
command.stdout.pipe(process.stdout, { end: false });
command.stderr.pipe(process.stderr, { end: false });
command.once('error', () => process.send({ type: 'exit', code: 1 }));
command.once('exit', (code) => process.send({ type: 'exit', code: code ?? 1 }));
command.once('close', () => process.send({ type: 'closed' }));
