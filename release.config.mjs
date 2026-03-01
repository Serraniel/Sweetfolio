/**
 * Semantic Release Configuration
 *
 * Custom writerOpts deduplicates changelog entries caused by the merge queue
 * creating real merge commits (--merge). When individual commits already follow
 * conventional commit format, the PR merge commit (identified by trailing
 * `(#N)` in the subject) is redundant and gets filtered out. If the only
 * conventional commits in a release are PR merge commits, they are kept as a
 * fallback so the changelog is never empty.
 */
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
					finalizeContext(context) {
						const prRefPattern = /\s\(#\d+\)$/;

						const allCommits = context.commitGroups.flatMap((g) => g.commits);
						const hasNonMergeCommits = allCommits.some(
							(c) => !prRefPattern.test(c.subject)
						);

						if (hasNonMergeCommits) {
							context.commitGroups = context.commitGroups
								.map((group) => ({
									...group,
									commits: group.commits.filter(
										(c) => !prRefPattern.test(c.subject)
									)
								}))
								.filter((group) => group.commits.length > 0);
						}

						return context;
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
