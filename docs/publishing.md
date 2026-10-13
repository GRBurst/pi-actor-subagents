# Publishing

Successful pushes to `main` publish `pi-actor-subagents` through npm Trusted Publishing. Pull requests and other branches only run checks. There are no stored npm tokens, release tags, version commits, or build step.

## Release policy

The repository version ends in `.0`, for example `0.1.0`. CI replaces the patch with `GITHUB_RUN_NUMBER`, producing versions such as `0.1.42` only in the release checkout. Choose a new major/minor baseline deliberately for incompatible changes. Keep the workflow identity and its counter intact within a version series; versions on npm are immutable.

Publication is serialized. Each release packs once and publishes those exact bytes. Retrying an existing version succeeds only if its integrity matches. Older queued runs publish under `snapshot`, leaving a newer `latest` untouched. The workflow must be the sole publisher of CI versions. Policy and package-content tests are in `scripts/*.test.ts`.

## One-time account setup

1. Publish the initial `0.1.0` package interactively with an npm account that has 2FA enabled. Review and test the package first. Use a writable user configuration if `~/.npmrc` is managed by Nix:

   ```bash
   nix develop -c npm \
     --userconfig "$HOME/.local/state/npm/pi-infinite-context.npmrc" \
     --cache "$(mktemp -d)" publish --access public --ignore-scripts
   ```

   This reuses the account configuration created for `pi-infinite-context`; it is not a package-specific credential.

2. In the npm package's **Settings → Trusted Publisher**, add:

   | Field | Value |
   |---|---|
   | Provider | GitHub Actions |
   | Organization or user | `fdietze` |
   | Repository | `pi-actor-subagents` |
   | Workflow filename | `ci.yml` |
   | Environment name | empty |
   | Allowed actions | **npm publish** enabled, not only staging |

3. Push to `main` or rerun the failed publishing job. npm requires a first successful release within two days of configuring the publisher. Verify CI, the npm version, and its provenance. After confirming OIDC, disable traditional-token publishing in the package settings.

The workflow grants `id-token: write` only to publication. Node and npm come from `flake.lock`; npm must support Trusted Publishing (11.5.1 or newer). See the [npm documentation](https://docs.npmjs.com/trusted-publishers/).
