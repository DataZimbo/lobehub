# Dependency handoff ledger

This is a coordination record, not a merge plan or proof of product acceptance. D remains on its F-based preparation branch. Only the coordinator may identify the final integrated base.

| Stream | Latest explicitly supplied dependency                         | Evidence / integration boundary                                                                      |
| ------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| F      | `66af6210de918a26394f9afe5a389ac99c3de71f`                    | D starting source; control registration deliberately gated                                           |
| T      | `2354874fdd4e5fbe2304a483a994611f859e7c6d`                    | Native tool identity and observation payload                                                         |
| S      | `a67a39c6492d50edb4113006b196f9657726da6b`                    | Parent persisted hooks and child startup notifications                                               |
| H      | `bea67eb8bbbdfdb990b8216e9cbbdc5ad559e712` on T2354874        | Coordinator reports 49 tests; same-environment 281/281 type diagnostics, no additions                |
| K      | `5e3a2f7327a76b7f77ec83c2f73403551a86bcc9` includes F66af6210 | PR20130 draft targets F; coordinator reports 21 tests, 263/263 type diagnostics; interface unchanged |
| L      | `98684e1d` (PR20131, old F base)                              | F update pending in this handoff; do not infer inclusion from branch name                            |
| C1/C2  | Final integrated revisions not supplied to D in this update   | No final execution or branch merge                                                                   |

H source handoff inspected: `/tmp/lobehub-hook-h-handoff-pr.md`. Builders are exported from `@lobechat/agent-runtime`, implemented in `packages/agent-runtime/src/utils/humanInterventionHooks.ts`: `buildHumanInterventionHookContext`, `buildBeforeHumanInterventionEvent`, `buildAfterHumanInterventionEvent`, `buildStopByHumanInterventionEvent`. Use actual operation identity and final pending payload, not original arguments. Context parent identity comes only from real lineage. Modern continuation call sites remain C2's integration responsibility; D's H09/H10/C04 plan already covers effective resolution, rollback/reuse, and both approval paths.

Reported upstream tests/types are dependency handoff evidence, not independently rerun by D or substitutes for real runtime/queue/device/Web evidence. This phase does not modify those worktrees or merge their branches.

Modern continuation attachment points from H's handoff: `apps/server/src/services/aiAgent/pipeline/approvalResume.ts` (`claimApprovalResume`, `tryReuseInterventionContinuation`), `pipeline/startOperation.ts` (continuation creation/retirement), and `intervention/InterventionController.ts::stopPendingApproval` (modern batch stop). H's existing producers are `humanApprove.ts` and `HumanInterventionHandler.ts`. D must distinguish H builder coverage from C2's actual continuation wiring.
