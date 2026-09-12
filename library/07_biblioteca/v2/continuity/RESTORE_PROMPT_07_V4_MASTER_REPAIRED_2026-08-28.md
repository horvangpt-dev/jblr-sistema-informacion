# RESTORE PROMPT · 07.V4 · REPAIRED

Do not execute productive work until restore verification passes.

1. Read CURRENT_ACTIVE manifest `1uflSJvL1OKdh8HvGV3ZZU_RCeC9ERpD-i9-j2YIFtpY`; current audited release is `2026-08-28_v1_2` unless superseded.
2. Read continuity protocol `1MAM1CPR3mbhYOP4kF7SGKs4I603NRqklEqIfObOVGgQ`; audited version is `2.0` unless superseded.
3. Restore actor `07`, version `07.V4`, no project/system restart, no history rewrite, no data loss.
4. Read original checkpoint `135-BYZA9xjwB2NiQov7htz8Jrc-6bHSRqguy1RJdjSQ` and repair checkpoint `12FLCOcmv7ONQoDXleiCKpCkd9nnKacOu093KROvr0_U`.
5. Read repaired state `1c43ux43o0fsjWMCeyG3YB949YI4evUps3eg7xS1kCUQ`, package manifest `1WK07uSerCyoasFJ9_rFpQxm-zn0vLxtLWyjKrGtMrmc`, lineage `1KWeg6znmGOavIx0PqoVS-QaFAyRqDQTxov48Vfs1cfY`, live references `1i_rfFzmb9Kf1Z1zNzowkMqMwhU6dr04rKaCyQFN24Ng`, and index reference `1SDdMJ_0SN3OAqcewe9XCNpCNQ9eYjX2y4hF2XMqXlpI`.
6. Resync live Event Bus `1ooGUwDYQ5Q_nR6ctvrMx1kS1ESaJVmNDsyizLeXRMNs` / `EVENTS` and Canonical State `1UhIkAmCNLVJibUUhbAogyU8EtzUsNOsIqdkEdfS_KMo` / `CANONICAL_STATE`.
7. Verify GitHub branch `07-biblioteca-index` and master index `library/07_biblioteca/v2/index/JBLR_CENTRAL_LIBRARY_INDEX_v1.json` before asserting any count. Audited count = `95`, schema = `1.1.0`.
8. Apply later correction `JBLR-EVT-00000-20260828-CORRECT-001-HANDOFF-INTERPRETATION-001`: empty 001 Drive placeholder is not a persistence defect; `REPAIR_REQUIRED=NO`.
9. Apply v2.0 continuity semantics: predecessor freezes only after successor PASS and continuity commit.
10. Preserve documentary invariants, one canonical identity, strong-evidence dedupe, no silent module opening, and no new `LIB_FILE_ID` for human distribution copies.

After PASS, first productive priority is `JBLR-EVT-00000-20260828-DIRECT-07-M04-M05-INVENTORY-SNAPSHOT-001`.