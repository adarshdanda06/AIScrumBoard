#!/usr/bin/env tsx
/**
 * Interactive environment setup wizard for AIScrumBoard.
 * Run: pnpm setup
 */
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve } from 'path';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

async function main() {
  console.log('\n🚀 AIScrumBoard Environment Setup\n');
  console.log('This wizard will create a .env file with your configuration.\n');

  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const overwrite = await ask('.env already exists. Overwrite? [y/N] ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  const examplePath = resolve(process.cwd(), '.env.example');
  let template = existsSync(examplePath) ? readFileSync(examplePath, 'utf8') : '';

  console.log('1/4 GitHub OAuth App\n   Create one at: https://github.com/settings/developers');
  const githubClientId = await ask('   GITHUB_CLIENT_ID: ');
  const githubClientSecret = await ask('   GITHUB_CLIENT_SECRET: ');

  console.log('\n2/4 Anthropic API Key\n   Get one at: https://console.anthropic.com/');
  const anthropicApiKey = await ask('   ANTHROPIC_API_KEY: ');

  console.log('\n3/4 Auth Secret (auto-generated if empty)');
  const authSecretInput = await ask('   BETTER_AUTH_SECRET [auto]: ');
  const authSecret = authSecretInput || randomBytes(32).toString('hex');

  console.log('\n4/4 Encryption Key (auto-generated if empty)');
  const encKeyInput = await ask('   ENCRYPTION_KEY [auto]: ');
  const encKey = encKeyInput || randomBytes(32).toString('hex');

  const envContent = template
    .replace(/^GITHUB_CLIENT_ID=.*/m, `GITHUB_CLIENT_ID=${githubClientId}`)
    .replace(/^GITHUB_CLIENT_SECRET=.*/m, `GITHUB_CLIENT_SECRET=${githubClientSecret}`)
    .replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${anthropicApiKey}`)
    .replace(/^BETTER_AUTH_SECRET=.*/m, `BETTER_AUTH_SECRET=${authSecret}`)
    .replace(/^ENCRYPTION_KEY=.*/m, `ENCRYPTION_KEY=${encKey}`);

  writeFileSync(envPath, envContent);
  console.log('\n✅ .env file created successfully!');
  console.log('\nNext steps:');
  console.log('  1. Start infrastructure: cd infra/docker && docker compose up -d postgres redis');
  console.log('  2. Run migrations:       pnpm db:migrate');
  console.log('  3. Start development:    pnpm dev');
  rl.close();
}

main().catch(console.error);
