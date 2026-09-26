# 16. Requirements traceability

Use this table during review to prevent a polished interface from omitting agreed mechanics. Test IDs refer to [10](10_TESTING_SECURITY_AND_ACCEPTANCE.md); stages refer to [12](12_CODEX_BUILD_PLAN.md).

| Requested capability | Authoritative specification | Build stages | Main tests |
|---|---|---|---|
| Continuous 2D water/islands | 01 world, movement, collision | P02 | G01-G03 |
| Acceleration-based ships with life | 01 entities/kinematics | P02-P03 | G02, G04-G05 |
| Cannonballs and range | 01 combat; 02 effects | P03, P08 | G04-G05, U05 |
| Capture enemy flag and return home | 01 flag lifecycle | P03 | G06, G09, G11 |
| Give flag to teammate | 01 give; 05 actions | P03 | G07 |
| Set flag on land | 01 shoreline sites/placement | P03 | G08 |
| Death and configurable respawn | 01 death/respawn; 13 defaults | P03 | G10 |
| One ship or fleets | 01 modes; 05 team interface | P04 | G12 |
| Per-ship sight radius/fog | 05 visibility/team union | P04 | F01-F04 |
| 30 FPS view with 100 ms decisions | 06 clocks and delayed controls | P04 | T01-T05 |
| Paste/upload agent code | 03 intake/sandbox; 05 contract | P05 | S01, S03-S04, S06-S09 |
| Text/model neural submission | 03 adapters; 05 model schemas | P06 | S02, S05, R04-R05 |
| Train entirely in browser | 07 actual Q-learning/DQN | P10-P11 | R01-R09, T09 |
| Explain observations/actions | 05 API; 09 Agent Lab | P07 | F04, U01-U03 |
| Cute directional pirate art | 02; 04; bundled asset skill | P08 | U04-U06 |
| Sinking/cannon/splash animation | 02 event effects | P08 | G10, F02, U04-U06 |
| Small free sound design | 04; asset skill/audio generator | P08 | F02, U04-U06 |
| Several student agents | 08 roster/version rules | P12 | C01-C04, C07 |
| Fast all-versus-all tournament | 06 headless; 08 scheduling | P12 | C01-C04 |
| Standings and matchup metrics | 08 calculations | P12 | C03-C04 |
| Class-wide live presentation | 08 Classroom Live; 09 S13 | P13 | C05-C09 |
| Click matchup to watch game | 06 recorded replay; 08 selection | P07, P13 | T06-T08, C05 |
| Browser-only/static deployment | 03 boundaries; 11 hosting | P01, P15 | U07-U10 |
| Codex-ready documents and skill | AGENTS.md; 12; fleetrl-assets | All stages | Bundle checks plus stage gates |
| Native headless Python game | Python guide; 01, 05, 06 rules | P16 | Python core/env tests |
| Gymnasium and PettingZoo adapters | Python guide; 05 contracts | P17 | Adapter/checker tests |
| Python Q-learning, DQN, evaluation, export | Python guide; model compatibility | P18 | Training/export and clean-bundle tests |
| Python-to-browser Dense transfer | Model compatibility; cross-language parity | P18-P19 | Logit/action round trip and production E2E |
| Shared rules, RNG, trajectories, maps | Cross-language parity; 06 determinism | P16-P19 | 12 trajectories, adapters, procedural maps |
| Tested downloadable training kit | 11 deployment; Python guide | P19 | Manifest, clean install/train/export, UI download |
| Offline-complete classroom runtime | 11 offline/deployment | P15, P19 | Production offline abort/reload test |
| Production art/audio provenance | 02, 04, asset manifest | P08 | Asset build/hash/browser/audio checks |
| Release measurements and evidence | 10 acceptance; release verification | P15, P19 | Production Playwright and artifact evidence |

## Release scope check

All rows above are implemented first-release requirements. Advanced model backends and decentralized policies remain explicitly deferred in the decision log. Numerical values are changeable defaults, but changes must be versioned. Actual evidence and remaining operational limitations are recorded in `RELEASE_VERIFICATION.md` and `IMPLEMENTATION_STATUS.md`; no demonstration metric is presented as agent performance.
