import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const ENV_FILE_NAMES = ['.env', '.env.local'] as const;

export function loadServerEnv(): void {
  const appRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(appRoot, '..', '..');
  const mergedEnv: Record<string, string> = {};

  for (const directory of [repoRoot, appRoot]) {
    for (const fileName of ENV_FILE_NAMES) {
      const filePath = path.join(directory, fileName);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      Object.assign(mergedEnv, parse(fileContent));
    }
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}