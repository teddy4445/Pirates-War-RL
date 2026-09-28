# GitHub Pages deployment

The repository is prepared to publish the production `dist/` artifact at `https://rl.teddylazebnik.com/`. Runtime routes use URL hashes, and compiled assets, workers, audio, examples, downloads, and the service worker resolve relative to the deployed site root. The same artifact therefore also works temporarily at `https://<owner>.github.io/<repository>/` before the custom domain is active.

## One-time GitHub configuration

1. Put the contents of `FleetRL_Codex_Bundle` at the root of its own GitHub repository. The `.github/workflows/deploy-pages.yml` file must be at the repository root; GitHub does not discover workflows nested inside an unrelated repository.
2. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. In **Settings → Pages → Custom domain**, enter `rl.teddylazebnik.com` and save it. After DNS resolves and GitHub provisions the certificate, enable **Enforce HTTPS**.
4. At the DNS provider for `teddylazebnik.com`, create a CNAME record:

   | Field | Value |
   |---|---|
   | Type | `CNAME` |
   | Host / name | `rl` |
   | Target / value | `<github-owner>.github.io` |

   Replace `<github-owner>` with the account or organization that owns the Pages repository. Point directly to its `github.io` hostname—do not append the repository name or use `rl.teddylazebnik.com` as its own target.

5. Push `main`, or run **Deploy Pirates War RL to GitHub Pages** manually from the Actions tab.

GitHub treats the custom-domain value in repository Pages settings as authoritative for Actions deployments. `public/CNAME` is retained in the built artifact as a clear domain declaration and for compatibility with branch-based Pages publishing, but it does not replace the Settings step.

The workflow provisions Python 3.13 and runs `python tools/package_python.py` before Vite builds the website. This deterministically creates the downloadable training ZIP in a clean GitHub checkout, so the Pages artifact does not depend on a binary generated on a developer's machine.

## Local release checks

```text
npm ci
python tools/package_python.py
npm run verify
npm run pages:check
npm run test:e2e -- tests/e2e/shell.spec.ts
```

`pages:check` rejects a missing/wrong CNAME, missing `.nojekyll`, missing 404 recovery page, root-absolute generated asset URLs, missing offline manifest entries, or a missing Python download. The browser test also serves `dist/` below `/course/fleetrl/` to detect repository-subpath regressions.

After DNS has propagated, verify it on Windows with:

```text
Resolve-DnsName rl.teddylazebnik.com -Type CNAME
```

DNS propagation and GitHub's TLS certificate issuance are external operations and may not be immediate. Do not remove the DNS record while HTTPS is being provisioned.

Official references: [publishing with a custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
