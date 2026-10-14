# Build status: 04-pulse-energy-grid

Owner of this file: orchestrator only.

| Phase | Status | Evidence |
|---|---|---|
| 01-13 Sources, contracts, data, analytics | PASSED (orchestrator reran pytest 68/68; 40,776 hourly slots = 2021-01-01..2025-08-26 checked) | 17897cc, 6fd6ffa, f309812 |
| 14-17 Creative direction | PASSED with amendment (luminous Day Rose) | ae7f8be, c1fd0e4, 1967355 |
| 18-19 Shell + prototype (S00 Bloom, S03a Window City, S05 live HiGHS) | PASSED with fixes (orchestrator: tsc, lint, Vitest 54/54; D sheet read; agent e2e 36 passed; browser parity 108/108) | f3d5c72, ada9237; artifacts/evidence/stage-a/ |
| 20-22 Stage B + fixes | PASSED with fixes (orchestrator: Vitest 68/68, pytest 68/68 after dash-scan test fix e215c15; D sheet read; agent e2e 81 passed) | 5018bf7..9d54756; artifacts/evidence/stage-b/ |
| Fix batch (price layer, S04 pre-unroll) | PASSED (orchestrator: Vitest 69/69; sheet read) | f08c890; artifacts/evidence/fix-003/ |
| Pre-QA hardening (QA_LESSONS L1-L11) | PASSED (33e9770, 944db09; orchestrator: Vitest 70/70; phone sheets read) | artifacts/evidence/fix-c/, fix-d/ |
| 23-28 Independent QA | FAILED (P04-QA-001: 11 majors; 34/34 honest; real-GPU p95 10.1 ms; mobile LCP 1.82 s at high load) -> DATA-003 PASSED (2284833) + FIXE-001 PASSED (7041ca5) -> QA pass 2 FAILED (8 majors; CISO timestamp regimes; 16/24 closed; mobile LCP 1.8 s local) -> DATA-004 PASSED (c1f6277) + FIXF-001 (be35020) -> QA pass 3 FAILED (3 majors: D-034, D-037 regressions, D-038 pre-existing; 22c6a40, 5618ffc) -> FIXG-001 READY FOR QA (see below) -> QA pass 4 | b9824fa, 803c4f9, 22c6a40 |
| 23-30 | NOT_STARTED | |

## FIXG-001 (frontend, after QA pass 3)

- D-034: phone S08 credit behind a "DATA SOURCES AND ATTRIBUTION" disclosure (opened: full text, 13px, 80% white, opaque
  card); the echo rose keeps its bands (e2e: DOM hides < 15% of the rose's blue-band pixels at 390/375/360).
- D-037: S06 SIMULATED tag under the ledger at 1024-1279; at 768 the price key sits between the rose's 00 label and the
  ledger (T rose fit 196). D-035: legend labels SURPLUS / 0-25 ... 500-VOLL / VOLL, unit line explains them; no mid-word breaks.
- D-038: S07 bar rows on phones are label line + bar/value line; answer chips read as one block.
- D-033: S04 week plot holds to p 0.98 and the hand-off fade distance is 12% of the viewport.
- D-036: CTRL stage shorter so its tag clears the nav at landing; S04 hour labels hidden while a phone eases between slots.
- Fixed nav and corner buttons now opaque in every mode (scrolling CTRL content under them is never read through glass).
- Reduced motion: S00 headline in the first frame at every size; S01 compact positions reset in flow.
- New e2e: the QA pass-3 DOM-generated collision walk (collideAll, ported from qa-3/probes/collide.mjs) over 33 points
  in default, PRICE and reduced at 1280x720, 1024, 768, 390, 375, 360 (18 tests).
- Gate 2026-10-14 (FIXG-001 tree): full e2e 137 passed, 4 failed; the 4 were then closed: D-034 test recalibrated to the QA criterion (visible rose-blue share of the frame >= 1.5%; measured 3.0/2.7/2.2% at 390/375/360 against 0.0% in the failure), L19 phone price walks were slow, not hung (30 s locator timeout), and one real overlap fixed (SURPLUS over 0-25 at 360). Targeted rerun 3/3 pass. Next: independent QA pass 4.
