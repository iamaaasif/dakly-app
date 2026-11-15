import 'reflect-metadata';
import { readFile, writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { staffProvisionSchema } from '@dakly/contracts/staff-auth';
import { StaffProvisionService } from './staff-provision.service';
import { StaffProvisionModule } from './staff-provision.module';
async function provision(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath)
    throw new Error('Usage: provision-staff <input.json> <new-proof-file>');
  const input = staffProvisionSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')));
  // Reserve a new owner-only file before committing, so an existing secret is never overwritten.
  await writeFile(outputPath, '', { flag: 'wx', mode: 0o600 });
  const app = await NestFactory.createApplicationContext(StaffProvisionModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const result = await app.get(StaffProvisionService).provision(input);
    await writeFile(outputPath, JSON.stringify(result) + '\n', { mode: 0o600 });
  } finally {
    await app.close();
  }
}
void provision().catch(() => {
  process.stderr.write('Staff provisioning failed. Inspect the database before retrying.\n');
  process.exitCode = 1;
});
