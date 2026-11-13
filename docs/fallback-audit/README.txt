Bounded recovery audit v7
=========================
Completed in 98614 ms, exit0, single Node process with no concurrent repository
tests. Source hashes match start/end. Full puzzle outputs, requests and independent
proofs: bounded-recovery-v7.json. Readable aggregates and all99 cells:
bounded-recovery-v7-summary.json. Inventory/reserve construction and class-capacity
reports are also archived in this directory; none is merely an ignored artifact.

Independent hard requests (100 classic, 100 king): all200 succeeded in the shared
v6 primary attempt. Therefore this cohort demonstrates NO observed improvement in
natural failure rate: no request needed fresh retry or a fixed reserve.
Each delivered output was independently verified unique, legal and strictly hard.
A rolling max256 recent-key ledger modeled actual delivery, with200 independent
canonical bases and no repeated base. The same single primary result is the
counterfactual v6 result; this is not two independently diverging session runs.

Primary/total generation latency ms, mean / P50 / P95 / P99 / maximum:
classic: 174.52 / 150.70 / 365.91 / 541.38 / 628.26
king:    101.63 / 64.95 / 248.55 / 454.01 / 473.79

Three historical failures were separately replayed with exact empty ledgers.
All again failed primary and recovered through fresh-retry, not fixed inventory:
classic v2-51: DENSITY_NOT_REACHED; combined generation898.31 ms
classic v2-57: DENSITY_NOT_REACHED; combined generation1194.59 ms
classic v1-171: FRESH_DIFFICULTY_NOT_REACHED; combined generation1433.17 ms
These are targeted regression repairs, not an estimate of population success rate.

Coverage probe: 33 modes x3 tiers, one isolated request per cell/stage with empty
recent history. It measures available capability, not long-session success rate.
fresh-retry:96 verified; Miracle all3 tiers explicitly search-unsupported.
fixed stage:97 verified =19 original catalog +78 fixed reserve;
Miracle easy accepted, medium/hard explicitly CATALOG_EXHAUSTED, without downgrading.
All other32 modes succeeded at all3 tiers in each stage in this probe.

Stage latency ms, all requests, mean / P50 / P95 / P99 / maximum:
fresh-retry: 152.26 / 107.75 / 396.13 / 1094.54 / 1094.54
fixed:        90.61 / 50.34 / 568.63 / 642.36 / 642.36
Verified-only mean/P95/P99/max:
fresh-retry:157.01 / 396.13 / 1094.54 / 1094.54
fixed:       80.50 / 232.09 / 642.36 / 642.36
No unknown generation errors, invalid proof results or exceeded stage budgets.

Limits
------
Synchronous desktop Linux Node generation times exclude independent audit work.
They are not real browser, Windows, mobile, network or end-to-end UI latency.
8s primary /8s retry /4s fixed thresholds are checked against measured durations;
this script does not itself exercise terminating a real Worker at those limits.
Fixed inventory is finite and recent-history exclusion can exhaust it. Coverage
used empty history, not an assurance that every later session has a valid reserve.
Multi-grid equivalence uses conservative sorted canonical component spectra,
not a proof of full overlap-graph isomorphism. Rule-depth tiers are not general
human difficulty ratings. No source, production setting or user save was changed.

Reproduction (v6 baseline source directory required):
  RECOVERY_AUDIT_BASELINE=/path/to/v6 RECOVERY_AUDIT_OUTPUT=new-run.json node scripts/audit-bounded-recovery.cjs --run
  node scripts/summarize-bounded-recovery.cjs evidence/fallback/new-run.json
Without --run, only the plan is printed. Reports refuse overwriting evidence.
