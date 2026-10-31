#!/usr/bin/env node
/**
 * Licence compliance for production dependencies (P-8).
 *   node scripts/licenses.mjs check    — fail on licences outside the allow list
 *   node scripts/licenses.mjs notices  — regenerate THIRD_PARTY_NOTICES.md
 * Walks the runtime dependency tree from package.json without extra tooling.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'EUPL-1.2', 'WTFPL', 'MIT-0']);
const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

function readPkg(name) {
	const dir = join(root, 'node_modules', name);
	const file = join(dir, 'package.json');
	if (!existsSync(file)) throw new Error(`Dependency ${name} is not installed — run npm ci first.`);
	return { dir, pkg: JSON.parse(readFileSync(file, 'utf-8')) };
}

function licenseOf(pkg) {
	if (typeof pkg.license === 'string') return pkg.license;
	if (pkg.license?.type) return pkg.license.type;
	if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
	return 'UNKNOWN';
}

function licenseText(dir) {
	const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.|$)/i.test(n));
	return f ? readFileSync(join(dir, f), 'utf-8').trim() : null;
}

const seen = new Map();
// Runtime code that is bundled into the client although it is a devDependency.
const BUNDLED = ['svelte', '@sveltejs/kit', 'devalue', 'esm-env', 'clsx'];
const queue = [...Object.keys(rootPkg.dependencies ?? {})];
for (const name of BUNDLED) {
	if (!existsSync(join(root, 'node_modules', name, 'package.json'))) continue;
	const { dir, pkg } = readPkg(name);
	seen.set(name, {
		version: pkg.version,
		license: licenseOf(pkg),
		repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
		author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
		text: licenseText(dir)
	});
}
while (queue.length) {
	const name = queue.shift();
	if (seen.has(name)) continue;
	const { dir, pkg } = readPkg(name);
	seen.set(name, {
		version: pkg.version,
		license: licenseOf(pkg),
		repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
		author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
		text: licenseText(dir)
	});
	queue.push(...Object.keys(pkg.dependencies ?? {}));
}

const allowed = (expr) =>
	expr
		.replace(/[()]/g, '')
		.split(/\s+OR\s+/)
		.some((l) => ALLOWED.has(l.trim()));
const mode = process.argv[2] ?? 'check';

if (mode === 'check') {
	const bad = [...seen].filter(([, v]) => !allowed(v.license));
	for (const [name, v] of seen) console.log(`${allowed(v.license) ? '✓' : '✗'} ${name}@${v.version} — ${v.license}`);
	if (bad.length) {
		console.error(`\n${bad.length} dependency licence(s) not allowed.`);
		process.exit(1);
	}
} else if (mode === 'notices') {
	const lines = ['# Third-Party Notices', '', 'Sweetfolio includes the following open-source packages:', ''];
	for (const [name, v] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`## ${name}@${v.version}`, '', `- License: ${v.license}`);
		if (v.repository) lines.push(`- Repository: ${v.repository.replace(/^git\+/, '').replace(/\.git$/, '')}`);
		if (v.author) lines.push(`- Author: ${v.author}`);
		lines.push('');
		if (v.text) lines.push(...v.text.split(/\r?\n/).map((l) => `    ${l}`), '');
	}
	writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), lines.join('\n'));
	console.log(`Wrote THIRD_PARTY_NOTICES.md (${seen.size} packages)`);
} else {
	console.error('Usage: licenses.mjs check|notices');
	process.exit(2);
}
