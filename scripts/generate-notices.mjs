#!/usr/bin/env node

/**
 * Generate THIRD_PARTY_NOTICES.md from production dependency licenses.
 *
 * Run: node scripts/generate-notices.mjs
 *
 * This is called during CI and before Docker builds to ensure the
 * notices file is always up to date. The file is imported at build
 * time by the /licenses route.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const raw = execFileSync(
  'npx',
  ['license-checker', '--production', '--json', '--excludePrivatePackages'],
  { encoding: 'utf-8' },
);

const packages = JSON.parse(raw);
const lines = ['# Third-Party Notices', ''];
lines.push('This application includes the following third-party packages:', '');

for (const [name, info] of Object.entries(packages)) {
  lines.push(`## ${name}`);
  lines.push('');
  if (info.licenses) lines.push(`- **License:** ${info.licenses}`);
  if (info.repository) lines.push(`- **Repository:** ${info.repository}`);
  if (info.publisher) lines.push(`- **Author:** ${info.publisher}`);
  lines.push('');
}

writeFileSync('THIRD_PARTY_NOTICES.md', lines.join('\n'));
console.log(`Generated THIRD_PARTY_NOTICES.md (${Object.keys(packages).length} packages)`);
