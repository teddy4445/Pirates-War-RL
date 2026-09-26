# Bundle verification report

The original 2026-09-25 specification/input bundle passed its Markdown links, fenced JSON, default consistency, map geometry, starter-script, Dense fixture, asset-skill, sound-generation, and manifest checks before implementation. `INPUT_INVENTORY.md` preserves the input audit and `BUNDLE_MANIFEST.json` preserves the original payload hashes.

FleetRL is now implemented. The current software release evidence—including browser/Python test counts, static/offline/subpath checks, clean download installation, Python-to-browser tournament/replay proof, measurements, screenshots, hashes, and honest limitations—is in [docs/RELEASE_VERIFICATION.md](docs/RELEASE_VERIFICATION.md).

## Reproducible checks

```text
python tools/check_bundle.py
node tools/test_examples.cjs
npm run release:verify
```

The first two commands retain the original specification/fixture checks. The release command regenerates production assets/examples/the Python ZIP and runs the browser, Python, parity, clean-bundle, and production integration gates. The downloadable ZIP contains its own file-hash manifest; hashes are integrity inventory, not signatures or a security certification.

## Claims deliberately not made

- Short smoke training proves the mechanics and transfer path, not a strong policy or learning convergence.
- Local classroom results are not authenticated or tamper-resistant online grades.
- Browser deadlines are best-effort budgets, not hard real-time guarantees.
- No public deployment was performed.
- Audio has managed-browser and sample/file QA, but the target classroom equipment still needs a human audition.
