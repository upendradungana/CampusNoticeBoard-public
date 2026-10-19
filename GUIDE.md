# CTE412 lab – step-by-step (student 02230158, Windows PowerShell)

Repo root: `C:\Users\qwerty\Desktop\Modules\IntegratedSys\lab14\CampusNoticeBoard`
Everything below is run from that folder unless stated. Forward slashes work in PowerShell.

## 0. Read this first (honest findings)

**Tested vs untested.** I tested `app/server.js` (all three versions, warm-up, flag, SIGTERM) and `scripts/summarise.sh` here. I could not run Docker/kind/kubectl, so every manifest is YAML-validated only, not applied. Expect to debug a typo or two; the Troubleshooting section covers the likely ones.

**Problems in what you uploaded (all fixed in the files I gave you):**
1. `server.js` still had `STUDENT_ID = "<sid>"`. `/version` would not show your number -> "evidence without sid is not marked". Your Task 2 evidence is therefore suspect: **redo Task 2.**
2. 1.0.0 returned `category`/`pinned` too, so it was not the "baseline" and 1.0.0 vs 1.1.0 differed only by the flag. Now 1.0.x returns id+title only; 1.1.0+ adds `category`, `pinned`, `pinnedFirst`.
3. No SIGTERM handler. Node is PID 1, ignores SIGTERM, so old Pods hang 30 s then get SIGKILLed (slow rollouts, Pods counted against quota while dying). Now it drains 5 s and exits. This also is what makes "zero failed requests" achievable in Tasks 6 and 8.
4. `init.yaml`: label `cte412/practical: "14"` but Task 1.2 says `"06"`; part-of value `campus-notice-board` vs spec text `campus-noticeboard`; annotation held your student number but the spec says **full name**. **Fix `student.name` to your real name** and re-apply. Check the part-of value against your copy of the PDF (the PDF is inconsistent: it says Practical 14/15/6 in different places; I followed the task text literally = `06`, `p06-report.md`). If unsure, ask your instructor which label value the grader checks.
5. Your Dockerfile uses `ARG VERSION`, so build with `--build-arg VERSION=...` (not `APP_VERSION`).
6. The Dockerfile/server.js you uploaded have Windows CRLF endings. For `.sh` files that breaks execution. I added `.gitattributes`; also keep `scripts/summarise.sh` as LF (VS Code status bar: click `CRLF` -> `LF`).

**Screenshots: you need none, and the PDF is not the deliverable.** Section 2 rules: evidence is `.txt` in `evidence/`; "screenshots are accepted only where text output is impossible". Every item in this lab is text. Submission is the **repository URL on the VLE** + commits during the session + `report/p06-report.md`. Writing on the PDF earns nothing. The only place a screenshot could ever be justified is if the marker tells you otherwise; don't spend time on it.

**Honest deviation to disclose in your report:** Task 7 says "Remove the Task 3 Deployment" and Task 6.3 is the *only* allowed imperative change. I use `kubectl delete -f manifests/rolling/deployment.yaml` (file-driven). Say so in the Reflection; do not hide it. Task 9.2's bulk delete is explicitly requested by the spec.

## 1. One-time PowerShell setup (paste into every new window)

```powershell
cd C:\Users\qwerty\Desktop\Modules\IntegratedSys\lab14\CampusNoticeBoard
$CL = "cte412-02230158"

# Run a command, show output, and save it (ASCII, with a header proving context + namespace = your sid).
function Ev {
  param([string]$File, [scriptblock]$Cmd, [switch]$Append)
  $ctx = "$(kubectl config current-context 2>$null)"
  $ns  = "$(kubectl config view --minify -o jsonpath='{..namespace}' 2>$null)"
  $hdr = "# $(Get-Date -Format s)  context=$ctx  namespace=$ns`r`nPS> $($Cmd.ToString().Trim())"
  if ($Append) { "" | Out-File -Encoding ascii -Append $File; $hdr | Out-File -Encoding ascii -Append $File }
  else         { $hdr | Out-File -Encoding ascii $File }
  $out = & $Cmd 2>&1 | ForEach-Object { "$_" }
  $out | Out-File -Encoding ascii -Append $File
  $hdr; $out
}

# Cluster-clock timestamp (same clock as the monitor log) written to a marks file, call right BEFORE an apply.
function Mark([string]$Label, [string]$File) {
  $t = kubectl exec monitor -- date -u +%Y-%m-%dT%H:%M:%SZ
  "$t  $Label" | Out-File -Encoding ascii -Append $File; "$t  $Label"
}

# Save monitor log from 15 s before $t0 until now. Uses relative --since so host/VM clock skew cannot bite.
function LogSince($t0, [string]$File) {
  $span = [int]((Get-Date) - $t0).TotalSeconds + 15
  kubectl logs monitor --since="$($span)s" | Out-File -Encoding ascii $File
  "saved $File : $((Get-Content $File).Count) lines"
}

# Run scripts/summarise.sh inside alpine (no Git Bash / CRLF problems with the shell), save and print.
function Sum([string]$Log, [string]$Out) {
  $p = $Log -replace '\\','/'
  $r = docker run --rm -v "${PWD}:/w" alpine:3.20 sh /w/scripts/summarise.sh "/w/$p"
  $r | Out-File -Encoding ascii $Out; $r
}
```
**Never use `>` or `Tee-Object` for evidence in Windows PowerShell 5.1:** it writes UTF-16 and the summariser/graders see garbage. Use the helpers above.

Copy the delivered files into your repo first (overwrite): everything in `CampusNoticeBoard/` of the download (`app/`, `cluster/`, `manifests/`, `scripts/`, `README.md`, `report/`, `.gitattributes`). Your `evidence/` stays; you will overwrite `t1-*`/`t2-*`.
Then open `manifests/base/init.yaml` and set `student.name` to your full name.

## 2. Task 1 – cluster, namespace, quota (re-capture; cluster is already fine)

Cluster file only gained comments; no need to recreate. Check it exists: `kind get clusters` (must list `cte412-02230158`). If not: `kind create cluster --config cluster/kind-cluster.yaml --name $CL`.

```powershell
kubectl apply -f manifests/base/init.yaml
kubectl config set-context --current --namespace=nb-02230158

Ev evidence/t1-nodes.txt   { kubectl get nodes -o wide }
Ev evidence/t1-quota.txt   { kubectl describe resourcequota notice-board-quota; kubectl describe limitrange notice-board-limits; kubectl describe namespace nb-02230158 }
Ev evidence/t1-context.txt { kubectl config current-context; kubectl config get-contexts }

git add -A; git commit -m "T1: cluster, namespace, quota, limit range"
```
Check: 3 nodes `Ready` named `cte412-02230158-*`; quota Hard column = 1/1Gi/2/2Gi/15/4; namespace shows both labels and your full name.

## 3. Task 2 – images (redo)

```powershell
docker build --build-arg VERSION=1.0.0        -t notice-board:02230158-1.0.0        app
docker build --build-arg VERSION=1.1.0        -t notice-board:02230158-1.1.0        app
docker build --build-arg VERSION=1.2.0-broken -t notice-board:02230158-1.2.0-broken app
docker pull busybox:1.36.1

kind load docker-image notice-board:02230158-1.0.0 notice-board:02230158-1.1.0 notice-board:02230158-1.2.0-broken busybox:1.36.1 --name $CL

Ev evidence/t2-images-local.txt   { docker image ls notice-board }
Ev evidence/t2-cluster-images.txt { docker exec cte412-02230158-worker crictl images | Select-String -Pattern "IMAGE|notice-board|busybox" }

Ev evidence/t2-container-test.txt {
  docker rm -f nb-test 2>$null | Out-Null
  "container start: $(Get-Date -Format HH:mm:ss.fff)"
  docker run -d --rm --name nb-test -p 18080:8080 notice-board:02230158-1.0.0 | Out-Null
  Start-Sleep -Milliseconds 1500
  "--- UNDER 5 s after start ($(Get-Date -Format HH:mm:ss.fff)) ---"
  curl.exe -s http://127.0.0.1:18080/version
  curl.exe -s -o NUL -w "healthz HTTP %{http_code}" http://127.0.0.1:18080/healthz
  Start-Sleep -Seconds 6
  "--- OVER 5 s after start ($(Get-Date -Format HH:mm:ss.fff)) ---"
  curl.exe -s http://127.0.0.1:18080/version
  curl.exe -s -o NUL -w "healthz HTTP %{http_code}" http://127.0.0.1:18080/healthz
  curl.exe -s http://127.0.0.1:18080/notices
  docker rm -f nb-test | Out-Null
}
git add -A; git commit -m "T2: three release images"
```
Check: first healthz `500`, second `200`; `/version` contains `"student":"02230158"`; E2.2 lists all three tags on the worker. If the run is slow and the first request lands after 5 s, rerun (you need it under 5 s).

Optional extra proof (not required): `docker run --rm -e FEATURE_PINNED=true -p 18080:8080 notice-board:02230158-1.1.0` then curl `/notices`.

## 4. Task 3 – deploy 1.0.0

```powershell
kubectl apply -f manifests/rolling/deployment.yaml
kubectl apply -f manifests/rolling/service.yaml
kubectl rollout status deployment/notice-board --timeout=120s

Ev evidence/t3-deploy-rs-pods.txt { kubectl get deployment,replicaset,pods -l app=notice-board -o wide --show-labels }
Ev evidence/t3-endpointslice.txt  { kubectl describe endpointslices -l kubernetes.io/service-name=notice-board }
Ev evidence/t3-version-spread.txt {
  $r = 1..12 | ForEach-Object { curl.exe -s http://127.0.0.1:30090/version }
  $r
  "--- distinct pods: " + (($r | ForEach-Object { ($_ | ConvertFrom-Json).pod } | Sort-Object -Unique) -join ", ")
}
git add -A; git commit -m "T3: deploy 1.0.0 and services"
```
Check: 3 Pods `1/1 Running`; 3 addresses in the slice; at least 2 distinct pods. (Probability of 12 requests hitting only one pod of 3 is ~(1/3)^11; if it happens, rerun.)

## 5. Task 4 – monitor and summariser

```powershell
kubectl apply -f manifests/base/monitor.yaml
kubectl wait --for=condition=Ready pod/monitor --timeout=60s
kubectl logs monitor --tail=5          # must show "... OK {"version":"1.0.0","student":"02230158",...}"
Start-Sleep -Seconds 70
kubectl logs monitor --since=60s | Out-File -Encoding ascii evidence/t4-monitor-atrest.txt
Get-Content evidence/t4-monitor-atrest.txt -TotalCount 10 | Out-File -Encoding ascii evidence/t4-atrest-first10.txt
Get-Content evidence/t4-atrest-first10.txt
Sum evidence/t4-monitor-atrest.txt evidence/t4-atrest-summary.txt
git add -A; git commit -m "T4: availability monitor and summariser"
```
Check: Failed requests = 0, roughly 100-110 requests. From now on **never delete or re-apply the monitor** until Task 9.
If it shows `ErrImageNeverPull`: `busybox:1.36.1` was not loaded; rerun the `kind load` line from Task 2.

## 6. Task 5 – Recreate vs RollingUpdate

Rule: the monitor is already running. Before each release wait until the system has been stable for 20 s.

**Window B (second PowerShell, needed only for 5.3):** start the Pod watch *before* applying 5.3:
```powershell
cd C:\Users\qwerty\Desktop\Modules\IntegratedSys\lab14\CampusNoticeBoard
Remove-Item evidence/t5-rolling-podwatch.txt -ErrorAction SilentlyContinue
kubectl get pods -l app=notice-board -L version -w | ForEach-Object { $l = "{0:HH:mm:ss}  {1}" -f (Get-Date), $_; $l; Add-Content -Path evidence/t5-rolling-podwatch.txt -Value $l -Encoding ascii }
```
Press Ctrl+C there once the rollout is complete.

### 5.1 Recreate release of 1.1.0
Edit `manifests/rolling/deployment.yaml`:
```yaml
  annotations:
    kubernetes.io/change-cause: "T5.1: Recreate release 1.0.0 -> 1.1.0"
spec:
  strategy:
    type: Recreate        # spec Task 5.1: stop all old Pods first, then start new ones
  # ...selector unchanged...
  template:
    metadata:
      labels:
        version: "1.1.0"
    spec:
      containers:
        - image: notice-board:02230158-1.1.0     # (name/other fields unchanged)
```
```powershell
$t0 = Get-Date
Mark "T5.1 apply Recreate 1.1.0" evidence/t5-marks.txt
kubectl apply -f manifests/rolling/deployment.yaml
kubectl rollout status deployment/notice-board --timeout=180s
Start-Sleep -Seconds 15
LogSince $t0 evidence/t5-recreate-monitor.txt
Sum evidence/t5-recreate-monitor.txt evidence/t5-recreate-summary.txt
Ev evidence/t5-rollout-history.txt { kubectl rollout history deployment/notice-board }
git add -A; git commit -m "T5.1: Recreate release 1.1.0"
```
Expect failures (order of 15-30, depends on timing): no Pod serves between old Pods stopping and new Pods passing readiness. Part of the gap is the app's 5 s drain, because Recreate waits for old Pods to finish terminating. Mention that in A1/A4; it is an honest measurement artefact.

### 5.2 Back to 1.0.0 (declaratively, unmeasured)
Edit: `change-cause: "T5.2: return to 1.0.0 (Recreate)"`, label `version: "1.0.0"`, image `...-1.0.0`.
```powershell
kubectl apply -f manifests/rolling/deployment.yaml
kubectl rollout status deployment/notice-board --timeout=180s
Ev evidence/t5-rollout-history.txt { kubectl rollout history deployment/notice-board } -Append
Start-Sleep -Seconds 25
git add -A; git commit -m "T5.2: back to 1.0.0"
```

### 5.3 RollingUpdate release of 1.1.0
Edit (replace the `strategy:` block, add `minReadySeconds`, change label/image/change-cause):
```yaml
  annotations:
    kubernetes.io/change-cause: "T5.3: RollingUpdate release 1.0.0 -> 1.1.0 (maxUnavailable 0, maxSurge 1, minReadySeconds 5)"
spec:
  minReadySeconds: 5        # a new Pod must stay Ready 5 s before it counts as available (spec)
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0     # spec: never drop below 3 serving Pods
      maxSurge: 1           # spec: at most one extra Pod
```
```powershell
$t0 = Get-Date
Mark "T5.3 apply RollingUpdate 1.1.0" evidence/t5-marks.txt
kubectl apply -f manifests/rolling/deployment.yaml
kubectl rollout status deployment/notice-board --timeout=180s
Start-Sleep -Seconds 15
# now Ctrl+C the watch in window B
LogSince $t0 evidence/t5-rolling-monitor.txt
Sum evidence/t5-rolling-monitor.txt evidence/t5-rolling-summary.txt
Ev evidence/t5-rollout-history.txt { kubectl rollout history deployment/notice-board } -Append
git add -A; git commit -m "T5.3: RollingUpdate release 1.1.0"
```
Expect 0 failures. **Mixed-version window** = `last seen 1.0.0` minus `first seen 1.1.0` from the summary (Recreate: no overlap, so 0, with a failure gap instead):
`([datetime]'2026-..T..Z' - [datetime]'2026-..T..Z').TotalSeconds`.
Note for E5.3: Kubernetes reuses a ReplicaSet when you return to an old template and gives it a new revision number, so old revision numbers vanish from history. That is why history is captured after every step (append mode).
Evidence name note: the spec's E5.1/E5.2 = `t5-recreate-monitor.txt` + `t5-recreate-summary.txt`, `t5-rolling-monitor.txt` + `t5-rolling-summary.txt`.

## 7. Task 6 – failed release and rollback

Edit: add `progressDeadlineSeconds: 60   # rollout with no progress for 60 s is marked failed (must exceed minReadySeconds)` under `spec:`; `change-cause: "T6.1: release 1.2.0-broken (expected to fail)"`; label `version: "1.2.0-broken"`; image `notice-board:02230158-1.2.0-broken`. Wait 25 s of stability first.
```powershell
$t0 = Get-Date
Mark "T6.1 apply broken 1.2.0" evidence/t6-marks.txt
kubectl apply -f manifests/rolling/deployment.yaml
kubectl rollout status deployment/notice-board --timeout=120s       # returns an error after ~60 s: deadline exceeded
Ev evidence/t6-deployment-conditions.txt { kubectl describe deployment notice-board }
Ev evidence/t6-pods-during-failure.txt   { kubectl get pods -l app=notice-board -L version -o wide }
Ev evidence/t6-rollout-history.txt       { kubectl rollout history deployment/notice-board }
git add -A; git commit -m "T6.1: broken release applied"

# T6.3 - the ONE permitted imperative change
Mark "T6.3 rollback" evidence/t6-marks.txt
Ev evidence/t6-rollback.txt { kubectl rollout undo deployment/notice-board; kubectl rollout status deployment/notice-board --timeout=120s }
Start-Sleep -Seconds 15
LogSince $t0 evidence/t6-monitor.txt
Sum evidence/t6-monitor.txt evidence/t6-summary.txt
```
Report: condition type **Progressing**, status False, reason **ProgressDeadlineExceeded**. Pods: 3 old `1/1`, 1 new `0/1` (never Ready).
E6.3 must show **0 failures**. If not, fix and repeat the whole task (the spec says so).

### 6.4 Sync manifest to live and prove it
```powershell
Ev evidence/t6-live-fields.txt { kubectl get deployment notice-board -o yaml | Select-String -Pattern "change-cause|progressDeadlineSeconds|image:|version:|type:|maxSurge|maxUnavailable|minReadySeconds" }
```
Edit the manifest so those fields match what the live object shows: image `...-1.1.0`, label `version: "1.1.0"`, and `change-cause` **exactly equal to the live string** (after `rollout undo` it is the T5.3 text). Then:
```powershell
kubectl apply -f manifests/rolling/deployment.yaml     # refreshes last-applied; no Pod roll because the template is unchanged
Ev evidence/t6-manifest-agree.txt {
  kubectl apply -f manifests/rolling/deployment.yaml
  kubectl rollout history deployment/notice-board
  kubectl get pods -l app=notice-board -L version
}
```
Second `apply` must print `deployment.apps/notice-board unchanged`. Optional strongest proof (needs a `diff` binary; Git ships one):
```powershell
$env:KUBECTL_EXTERNAL_DIFF = "C:\Program Files\Git\usr\bin\diff.exe"
Ev evidence/t6-manifest-diff.txt { kubectl diff -f manifests/rolling/deployment.yaml; "kubectl diff exit code: $LASTEXITCODE" }
```
Exit code 0 and empty diff = identical. `git add -A; git commit -m "T6: rollback, manifest synced"`.
Wait 20 s of stability before Task 7.

## 8. Task 7 – blue/green

```powershell
# 7.0 remove the Task 3 Deployment (quota must hold both colours). Failures in this window are expected and are NOT part of E7.3.
Ev evidence/t7-remove-rolling.txt { kubectl delete -f manifests/rolling/deployment.yaml; kubectl wait --for=delete pod -l app=notice-board --timeout=90s }

kubectl apply -f manifests/bluegreen/deployment-blue.yaml
kubectl apply -f manifests/bluegreen/deployment-green.yaml
kubectl apply -f manifests/bluegreen/services.yaml
kubectl rollout status deployment/notice-board-blue  --timeout=120s
kubectl rollout status deployment/notice-board-green --timeout=120s
git add -A; git commit -m "T7: blue and green Deployments, Services"

# evidence BEFORE switching
Ev evidence/t7-endpointslices-before.txt {
  kubectl describe endpointslices -l kubernetes.io/service-name=notice-board
  kubectl describe endpointslices -l kubernetes.io/service-name=notice-board-preview
  kubectl get pods -l app=notice-board -L slot,version -o wide
}
Ev evidence/t7-preview-vs-production.txt {
  "--- preview (expect 1.1.0) ---"
  1..5 | ForEach-Object { kubectl exec monitor -- wget -q -O - http://notice-board-preview/version }
  "--- production (expect 1.0.0) ---"
  1..5 | ForEach-Object { kubectl exec monitor -- wget -q -O - http://notice-board/version }
}
Ev evidence/t7-quota-both-colours.txt { kubectl describe resourcequota notice-board-quota }
```
Expected quota Used: pods 7, requests.cpu 610m, requests.memory 400Mi, limits.cpu 1250m, limits.memory 800Mi, count/services 3.

**Switches.** Helper to flip the two `SWITCH POINT` lines (or edit them by hand in VS Code):
```powershell
function Switch([string]$To) {
  $f = "manifests/bluegreen/services.yaml"
  (Get-Content $f -Raw) -replace '(?m)^(    slot: )(blue|green)(\s+# SWITCH POINT)', "`${1}$To`${3}" | Set-Content -Encoding ascii -NoNewline $f
  Select-String -Path $f -Pattern "SWITCH POINT"
}
Start-Sleep -Seconds 20
$t0 = Get-Date
Remove-Item evidence/t7-marks.txt -ErrorAction SilentlyContinue

# switch 1: blue -> green
Switch green; Mark "T7 switch 1 blue->green" evidence/t7-marks.txt
kubectl apply -f manifests/bluegreen/services.yaml
git commit -am "T7: switch 1 to green"
Start-Sleep -Seconds 5
Ev evidence/t7-endpointslices-after.txt {
  kubectl describe endpointslices -l kubernetes.io/service-name=notice-board
  kubectl describe endpointslices -l kubernetes.io/service-name=notice-board-preview
  kubectl get pods -l app=notice-board -L slot,version -o wide
}
Start-Sleep -Seconds 20

# switch 2: green -> blue
Switch blue;  Mark "T7 switch 2 green->blue" evidence/t7-marks.txt
kubectl apply -f manifests/bluegreen/services.yaml
git commit -am "T7: switch 2 back to blue"
Start-Sleep -Seconds 20

# switch 3: blue -> green
Switch green; Mark "T7 switch 3 blue->green" evidence/t7-marks.txt
kubectl apply -f manifests/bluegreen/services.yaml
git commit -am "T7: switch 3 to green (final)"
Start-Sleep -Seconds 20

LogSince $t0 evidence/t7-monitor.txt
Sum evidence/t7-monitor.txt evidence/t7-summary.txt
Get-Content evidence/t7-marks.txt | Add-Content -Encoding ascii evidence/t7-summary.txt
```
E7.1 "before/after": compare Pod IPs in the `notice-board` slice with the `slot` column of the Pod listing (blue IPs before, green IPs after; preview slice unchanged). Expect 0 failures and per-switch version flips at the marked times.
Leave production on **green** for Task 8. Wait 20 s.

## 9. Task 8 – feature flag

### 8.1 ConfigMap (false) + green reads it
In `manifests/bluegreen/deployment-green.yaml` set `change-cause: "T8.1: green reads FEATURE_PINNED from ConfigMap notice-board-flags"` and add to the container (next to `ports:`):
```yaml
          env:
            - name: FEATURE_PINNED                # read at container start by server.js
              valueFrom:
                configMapKeyRef:
                  name: notice-board-flags        # ConfigMap in configmap-flags.yaml
                  key: FEATURE_PINNED
```
```powershell
$t0 = Get-Date
Mark "T8.1 flags=false, green reads ConfigMap" evidence/t8-marks.txt
kubectl apply -f manifests/bluegreen/configmap-flags.yaml      # ConfigMap FIRST, or the Pods fail with CreateContainerConfigError
kubectl apply -f manifests/bluegreen/deployment-green.yaml
kubectl rollout status deployment/notice-board-green --timeout=180s
Start-Sleep -Seconds 10
Ev evidence/t8-notices-before.txt { curl.exe -s http://127.0.0.1:30090/version; curl.exe -s http://127.0.0.1:30090/notices }
git add -A; git commit -m "T8.1: feature flag ConfigMap, flag=false"
```
Expect `"pinnedFirst":false`, version 1.1.0 (production = green).

### 8.2 Flip the flag; do the running Pods notice?
Edit `configmap-flags.yaml`: `FEATURE_PINNED: "true"`.
```powershell
Mark "T8.2 flags=true applied" evidence/t8-marks.txt
kubectl apply -f manifests/bluegreen/configmap-flags.yaml
Start-Sleep -Seconds 20
Ev evidence/t8-pods-observe-flag.txt {
  "--- ConfigMap value ---"
  kubectl get configmap notice-board-flags -o yaml | Select-String "FEATURE_PINNED"
  "--- env inside each running green Pod ---"
  kubectl get pods -l slot=green -o name | ForEach-Object { "$_ -> FEATURE_PINNED=" + (kubectl exec $_ -- printenv FEATURE_PINNED) }
  "--- Pods (AGE/RESTARTS unchanged = not restarted) ---"
  kubectl get pods -l slot=green
  "--- production /notices ---"
  curl.exe -s http://127.0.0.1:30090/notices
}
git add -A; git commit -m "T8.2: flag true in ConfigMap only"
```
Expected: ConfigMap `true`, Pod env `false`, `pinnedFirst:false`: **running Pods do not observe it** (env from `configMapKeyRef` is resolved once at container start).

### 8.3 Make it take effect, zero failures, declaratively
In `deployment-green.yaml` set `change-cause: "T8.3: roll green Pods to pick up FEATURE_PINNED=true"` and add under `template.metadata`:
```yaml
      annotations:
        notice-board/flags-revision: "2"    # changing a Pod-template field forces a rolling replacement; bump on every flag change
```
```powershell
Mark "T8.3 roll green" evidence/t8-marks.txt
kubectl apply -f manifests/bluegreen/deployment-green.yaml
kubectl rollout status deployment/notice-board-green --timeout=180s
Start-Sleep -Seconds 15
Ev evidence/t8-notices-after.txt { curl.exe -s http://127.0.0.1:30090/version; curl.exe -s http://127.0.0.1:30090/notices }
LogSince $t0 evidence/t8-monitor.txt
Sum evidence/t8-monitor.txt evidence/t8-summary.txt
Get-Content evidence/t8-marks.txt | Add-Content -Encoding ascii evidence/t8-summary.txt
git add -A; git commit -m "T8.3: roll green Pods, flag takes effect"
```
Expect `"pinnedFirst":true` with notice 2 first; 0 failures. (`kubectl rollout restart` would also work but is imperative: forbidden.)
E8.1 = `t8-notices-before.txt` + `t8-notices-after.txt`; E8.2 = `t8-pods-observe-flag.txt`; E8.3 = `t8-summary.txt`.

## 10. Task 9 – reproducibility and clean-up

```powershell
kubectl logs monitor | Out-File -Encoding ascii evidence/t9-monitor-full.log
(Get-Content evidence/t9-monitor-full.log).Count      # sanity: thousands of lines

# delete everything except namespace, quota, limit range (spec 9.2; the monitor log is already saved above)
kubectl delete deployment,service,configmap,pod --all
kubectl get all,configmap,resourcequota,limitrange
```
(`kube-root-ca.crt` ConfigMap is recreated automatically by Kubernetes; ignore it.)
Now rebuild using **only README section 4** (copy-paste from the README, not from memory):
```powershell
Ev evidence/t9-rebuild.txt {
  kubectl apply -f manifests/bluegreen/configmap-flags.yaml
  kubectl apply -f manifests/bluegreen/deployment-blue.yaml
  kubectl apply -f manifests/bluegreen/deployment-green.yaml
  kubectl apply -f manifests/bluegreen/services.yaml
  kubectl apply -f manifests/base/monitor.yaml
  kubectl rollout status deployment/notice-board-blue
  kubectl rollout status deployment/notice-board-green
  kubectl get all,configmap,resourcequota,limitrange
  curl.exe -s http://127.0.0.1:30090/notices
}
```
Check: every object shows `created`; `/notices` shows `pinnedFirst:true`. Do not change a manifest here; if the rebuild fails, the README or manifests are wrong: fix, commit, and redo.
Fill the version table in `README.md`, then:
```powershell
kubectl config set-context --current --namespace=default
Ev evidence/t9-cluster-deleted.txt {
  kubectl config get-contexts
  kind delete cluster --name cte412-02230158
  "--- kind get clusters ---"
  kind get clusters
  "--- docker containers for the cluster (expect none) ---"
  docker ps -a --filter "name=cte412-02230158"
  kubectl config get-contexts
}
git add -A; git commit -m "T9: rebuild proof, cluster deleted"
git push
```
(Needs a remote: `git remote -v`. Submit that URL on the VLE.)

## 11. Evidence checklist (all `.txt` in `evidence/` except where stated)
| Item | File |
|---|---|
| E1.1/1.2/1.3 | t1-nodes, t1-quota, t1-context |
| E2.1/2.2/2.3 | t2-images-local, t2-cluster-images, t2-container-test |
| E3.1/3.2/3.3 | t3-deploy-rs-pods, t3-endpointslice, t3-version-spread |
| E4.1/4.2 | t4-atrest-first10, t4-atrest-summary (+ t4-monitor-atrest) |
| E5.1 | t5-recreate-monitor, t5-recreate-summary |
| E5.2 | t5-rolling-monitor, t5-rolling-summary |
| E5.3 / E5.4 | t5-rollout-history / t5-rolling-podwatch |
| E6.1/6.2/6.3/6.4 | t6-deployment-conditions, t6-pods-during-failure, t6-summary (+ t6-monitor), t6-manifest-agree (+ t6-manifest-diff) |
| E7.1/7.2/7.3/7.4 | t7-endpointslices-before + -after, t7-preview-vs-production, t7-summary (+ t7-monitor, t7-marks), t7-quota-both-colours |
| E8.1/8.2/8.3 | t8-notices-before + -after, t8-pods-observe-flag, t8-summary |
| E9.1/9.2 | t9-rebuild, t9-cluster-deleted; plus **t9-monitor-full.log** |

## 12. Report (report/p06-report.md)
Template provided. Peak Pods column: Recreate 3; RollingUpdate 4 (3 + 1 surge; see podwatch); broken 4; each blue/green switch 6; flag change 7 (3 blue + 3 green + 1 surge). Always prefer what your podwatch/`get pods` shows over my expectations. Write the analysis in your own words and cite file names. For A2, the fields to discuss: `maxUnavailable: 0`, `maxSurge`, readinessProbe on `/healthz`, `minReadySeconds`, `progressDeadlineSeconds`, liveness on `/version` not `/healthz`. Defaults to predict against: maxUnavailable 25% (rounds down to 0 with 3 replicas), maxSurge 25% (rounds up to 1), minReadySeconds 0, progressDeadlineSeconds 600. Think carefully rather than copying: with 3 replicas the *rounded* defaults matter.

## 13. Troubleshooting
- `kind load` error "content digest ... not found": Docker Desktop containerd image store. Fix: `docker save <image> -o x.tar; kind load image-archive x.tar --name $CL`, or Docker Desktop -> Settings -> General -> untick "Use containerd for pulling and storing images", rebuild.
- `ErrImageNeverPull`: image not on that node (`docker exec <node> crictl images`). Reload with `kind load`.
- `exceeded quota`: `kubectl describe resourcequota notice-board-quota`; terminating Pods still count for ~5 s.
- `CreateContainerConfigError` in Task 8: ConfigMap not applied before the green Deployment.
- `sh: set: illegal option -`: `summarise.sh` has CRLF. Fix: `(Get-Content scripts/summarise.sh -Raw) -replace "`r`n","`n" | Set-Content -NoNewline -Encoding ascii scripts/summarise.sh`.
- Port 30090 not reachable: `docker ps` must show `127.0.0.1:30090->30090/tcp` on the control-plane container. Changing `extraPortMappings` requires deleting and recreating the cluster (then redo Tasks 1-3 evidence).
- Monitor shows FAIL right after a `kubectl delete` of a Deployment: expected; nothing serves.
