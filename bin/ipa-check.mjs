#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { checkIpa, formatReport } from '../src/check.mjs';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log('usage: ipa-check <app.ipa> [--bundle-id com.example.app]');
  process.exit(args.length ? 0 : 2);
}

const path = args.find((a) => !a.startsWith('--'));
const bi = args.indexOf('--bundle-id');
const bundleId = bi >= 0 ? args[bi + 1] : undefined;

if (!path) {
  console.error('usage: ipa-check <app.ipa> [--bundle-id com.example.app]');
  process.exit(2);
}

try {
  const report = checkIpa(readFileSync(path), { bundleId });
  console.log(formatReport(report, path));
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error(`ipa-check: ${e.message}`);
  process.exit(2);
}
