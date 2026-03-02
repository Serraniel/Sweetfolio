/**
 * Semantic Release Configuration
 *
 * Custom writerOpts deduplicates changelog entries caused by the merge queue
 * creating real merge commits (--merge). When individual commits already follow
 * conventional commit format, the PR merge commit (identified by trailing
 * `(#N)` in the subject) is redundant and gets filtered out.
 */

const PR_REF_PATTERN = /\s\(#\d+\)$/;

export default {
	branches: ['main'],
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				releaseRules: [{ breaking: true, release: 'minor' }]
			}
		],
		[
			'@semantic-release/release-notes-generator',
			{
				writerOpts: {
					// Filter out PR merge commits to prevent duplicate changelog entries.
					// The merge queue creates merge commits with subjects like
					// "fix(scope): message (#42)" which duplicate the original commit
					// "fix(scope): message". We drop the merge commit variant.
					//
					// Returning a falsy value from transform() causes
					// conventional-changelog-writer to skip the commit entirely.
					// We must also handle the default Angular preset transform logic
					// (type mapping, breaking changes, etc.) since our transform
					// replaces the preset default.
					transform(commit) {
						if (PR_REF_PATTERN.test(commit.subject)) {
							return false;
						}

						// Replicate Angular preset's default transform behavior
						const discard = commit.type === null;
						const typeMapping = {
							feat: 'Features',
							fix: 'Bug Fixes',
							perf: 'Performance Improvements',
							revert: 'Reverts',
							docs: 'Documentation',
							style: 'Styles',
							refactor: 'Code Refactoring',
							test: 'Tests',
							build: 'Build System',
							ci: 'Continuous Integration',
							chore: 'Chores'
						};

						// Include breaking changes regardless of type
						const isBreaking =
							commit.notes && commit.notes.some((n) => n.title === 'BREAKING CHANGE');

						if (discard && !isBreaking) {
							return false;
						}

						const type = typeMapping[commit.type] || commit.type;
						const shortHash = typeof commit.hash === 'string' ? commit.hash.substring(0, 7) : commit.shortHash;

						return {
							type,
							shortHash
						};
					}
				}
			}
		],
		'@semantic-release/changelog',
		[
			'@semantic-release/npm',
			{
				npmPublish: false
			}
		],
		[
			'@semantic-release/git',
			{
				assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
				message: 'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}'
			}
		],
		'@semantic-release/github'
	]
};
