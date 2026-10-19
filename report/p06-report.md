# CTE412 Practical – Report (student 02230158)

## 1. Objective
<!-- 3-5 sentences in YOUR words: why measure failed requests per release strategy; what you built. -->

## 2. Environment
- OS: <Windows version>
- Docker: <docker --version>   kind: <kind version>   kubectl client: <...>   cluster Kubernetes: <kubectl version, server>
- Application: Node.js 20, base image node:20-alpine; monitor: busybox:1.36.1

## 3. Results
| Release | Requests observed | Failed requests | Mixed-version window (s) | Peak notice-board Pods |
|---|---|---|---|---|
| Recreate 1.0.0 -> 1.1.0 | | | | |
| RollingUpdate 1.0.0 -> 1.1.0 | | | | |
| Broken release 1.2.0-broken (incl. rollback) | | | | |
| Blue/green switch 1: blue -> green | | | | |
| Blue/green switch 2: green -> blue | | | | |
| Blue/green switch 3: blue -> green | | | | |
| Flag change (FEATURE_PINNED false -> true, green Pods rolled) | | | | |

Sources: evidence/t5-recreate-summary.txt, t5-rolling-summary.txt, t6-summary.txt, t7-summary.txt, t8-summary.txt, t5-rolling-podwatch.txt.

## 4. Analysis
### A1 – Ranking by failed requests
<!-- cite evidence files; explain: Recreate -> no endpoints between old Pods stopping and new Pods passing readiness. -->
### A2 – Why the broken release caused / did not cause failures
<!-- cite manifest fields: maxUnavailable, maxSurge, readinessProbe, minReadySeconds, progressDeadlineSeconds, livenessProbe path.
     Predict the monitor result if each were at its default (maxUnavailable 25%, maxSurge 25%, no minReadySeconds, progressDeadlineSeconds 600). -->
### A3 – RollingUpdate vs blue/green
<!-- mixed-version window; peak quota use (read t7-quota-both-colours.txt); rollback time (rollout undo vs one-line Service edit) -->
### A4 – A realistic case for Recreate
### A5 – What the feature flag allowed / did not avoid
<!-- allowed: behaviour change without new image. Not avoided: Pod restart/rollout, because env vars from a ConfigMap are read at container start (evidence/t8-pods-observe-flag.txt). -->

## 5. Reflection
- Error met: <paste the real error output, name the evidence/command, explain the reasoning that fixed it>
- Still unclear: <one genuine open question>

## 6. References
<!-- only what you actually opened, with access date e.g. kubernetes.io/docs/concepts/workloads/controllers/deployment/ (accessed 2026-10-19) -->
