# Preparation blockers closed — 2026-10-28

This update supersedes the two local preparation blockers in `pricing-mobile-2026-10-28.md`; it does not change application functionality or authorize publication.

## Public configuration diagnosis and production build

The original release's `.env.local` intentionally points to the local fixture. It is not production configuration. `scripts/real-local-frontend.mjs` identifies the separate, pre-existing `.local-review/real-frontend-public.json` used by the legitimate frontend launcher. Its URL was checked equal to Kevin project `vtpciccluvpaclbeqxih`, and its existing publishable key was accepted by the unchanged release guard.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` were passed in memory to the candidate build child process. No env file, private key, new credential or other project's configuration was copied. Neither Netlify variables, remote target nor permissions changed. `npm run build` passed. After dependency isolation, its unchanged guard and Vite commands were repeated successfully. The production dist contains the expected Kevin URL and existing public key, with no fixture credentials/route and no known private value. The former failure was loading the wrong local configuration source, not a reason to change the guard or target.

Evidence: `production-build-checks.json`, `production-artifact-checks.json` under `evidence/pricing-mobile-2026-10-28/`. The earlier `build-checks.json` and `artifact-audit.json` are retained as historical results of the first block, not the current status.

## Genuine Netlify packaging recovered

Netlify CLI27.14.2 was already installed in the existing npm execution cache, together with official `@netlify/zip-it-and-ship-it`16.5.0. Inspection of that package's README/API and the original release's manifest established NFT, Node24, the background AI run and scheduled cleanup. No installation of a CLI or new dependency was necessary. The CLI's `functions:build` helper omits per-function configuration in its direct zipFunctions call; the public package API was used explicitly with the existing `netlify.toml` Sharp external/included-file settings and the original runtime/bundler. No authenticated CLI command, remote environment retrieval or deploy was run.

Official reference: [Netlify Functions management](https://docs.netlify.com/api-and-cli-guides/cli-guides/manage-functions/). The installed official package README documents `zipFunctions`, `basePath`, `config`, `includedFiles`, `externalNodeModules`, `nodeBundler` and `nodeVersion`.

The first packaging attempt revealed that the candidate's `node_modules` junction was archived as an external filesystem link. Those ZIPs were rejected, not delivered. Only that candidate junction was removed. A normal `npm ci --offline --no-audit --no-fund` installed148 packages from the unchanged lockfile into an actual isolated directory. The existing official Linux Sharp0.35.5/libvips1.3.4 tarballs were checked against lockfile SHA512 integrity and extracted only inside candidate node_modules. No source dependency directory, lockfile, hook or policy changed. npm emitted its existing pending core-js postinstall approval notice; no approval/policy change was made or needed for the successful build/tests.

Rebuilt ZIPs are in `.test-tmp/netlify-functions/` (ignored, local artifacts):

| ZIP | Bytes | Result |
|---|---:|---|
| ai-run.zip | 2,236,657 | NFT; background; Node24; complete dependencies; new pricing markers present |
| ai.zip | 20,559,246 | NFT; stream; Node24; Linux Sharp/libvips ELF64 x86-64 |
| workers.zip | 19,550,054 | NFT; stream; Node24; Linux Sharp/libvips ELF64 x86-64 |
| worker-cleanup.zip | 19,546,438 | NFT; stream; Node24; schedule17 * * * *; Linux Sharp/libvips ELF64 x86-64 |

All archives passed ZIP integrity, safe-entry-path, absence of symlinks, env/private files, test directories, fixture credentials and equality scans against the existing Kevin private values in memory. Output records only variable names, never values. Production dist was scanned separately using the same comparisons. AI bundles include current paint/primer models, technical profile and material-selection logic. SHA256 digests, ELF digests and entry counts are in `production-artifact-checks.json`; sanitized manifest in `packaged-functions-manifest.json`.

Extracted bundled handlers all import on Windows. With private runtime env absent and fetch blocked, ai-run returns401 before authentication; ai/workers return503 for missing runtime configuration; cleanup was imported but never invoked. Zero network requests. `bundled-smoke.json` distinguishes this from Linux execution. The ELF binaries were inspected, not executed on Windows or Netlify.

Reproduction: `node scripts/package-production-functions.mjs <existing-official-package-root>`; bundled Python `scripts/check-production-artifacts.py <existing-Kevin-private-env-path> <existing-Kevin-public-json-path>`. These inspect local artifacts only. No private file is bundled. Actual ZIPs/dist remain ignored; evidence/scripts are versioned. Initial invalid ZIPs were overwritten by validated rebuilt outputs.

## Remaining limits

Both local preparation blockers are closed. The coordinator's reported migration blocker remains outside this task and was not revalidated remotely; this work does not resolve or assert its current remote state. No SQL or migration attempt occurred. Authorized publication must still validate the deployed environment/roles/persistence and actual Linux function loading. Physical iOS/Android keyboard/safe-area/zoom and Safari/WebKit QA remain outstanding. The existing bundle-size warning remains; it is not a build failure.

No supplier API or labor data was added. Pricing source, mobile source and original release remained unchanged. No push, deploy, new account, remote config change, credential generation or paid request occurred.
