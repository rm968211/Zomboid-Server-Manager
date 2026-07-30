# Agent Instructions

## Release versioning

The root `package.json` is the release-version source of truth. The publish
workflow reads its `version` field and applies that version to both the
`zomboid-server-manager` and `zomboid-server` Docker images.

Every pull request that changes either published image must include an
appropriate semantic-version bump in the root `package.json`:

- Patch (`x.y.Z`) for backward-compatible bug fixes.
- Minor (`x.Y.0`) for backward-compatible features.
- Major (`X.0.0`) for breaking changes.

Before choosing the next version, compare against the target branch and account
for any version bumps already merged there. Bump once per release PR, and call
out the new version in the pull-request description.

Do not use `app/package.json` for release versioning; it manages frontend
dependencies and scripts. Do not confuse the app release with
`game-version.conf`; that file records the installed Project Zomboid game build
for compatibility and tests.
