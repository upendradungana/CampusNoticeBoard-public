# Campus Notice Board on Kubernetes (CTE412 Practical, student 02230158)

## Purpose
Deploy the Campus Notice Board API to a local kind cluster, measure availability with an in-cluster monitor, and compare
Recreate, RollingUpdate and blue/green releases plus a feature flag. Every release claim in `report/p06-report.md`
is backed by a file in `evidence/`.

## Software versions
Fill from the real output of these commands before submitting:
```
docker --version
kind version
kubectl version
git --version
```
| Tool | Version |
|---|---|
| Docker | TODO |
| kind | TODO |
| kubectl (client / cluster) | TODO / TODO |
| Application | Node.js 20 on `node:20-alpine`; monitor on `busybox:1.36.1` |

## Rebuild from an empty machine (PowerShell, repo root)
### 1. Cluster
```
kind create cluster --config cluster/kind-cluster.yaml --name cte412-02230158
```
### 2. Images (built locally, loaded into the nodes, no registry)
```
docker build --build-arg VERSION=1.0.0        -t notice-board:02230158-1.0.0        app
docker build --build-arg VERSION=1.1.0        -t notice-board:02230158-1.1.0        app
docker build --build-arg VERSION=1.2.0-broken -t notice-board:02230158-1.2.0-broken app
docker pull busybox:1.36.1
kind load docker-image notice-board:02230158-1.0.0 notice-board:02230158-1.1.0 notice-board:02230158-1.2.0-broken busybox:1.36.1 --name cte412-02230158
```
### 3. Namespace, quota, limit range, default namespace
```
kubectl apply -f manifests/base/init.yaml
kubectl config set-context --current --namespace=nb-02230158
```
### 4. Final state of Task 8 (blue + green, production on green, flag true, monitor)
```
kubectl apply -f manifests/bluegreen/configmap-flags.yaml
kubectl apply -f manifests/bluegreen/deployment-blue.yaml
kubectl apply -f manifests/bluegreen/deployment-green.yaml
kubectl apply -f manifests/bluegreen/services.yaml
kubectl apply -f manifests/base/monitor.yaml
kubectl rollout status deployment/notice-board-blue
kubectl rollout status deployment/notice-board-green
```
### 5. Verify
```
curl.exe -s http://127.0.0.1:30090/version
curl.exe -s http://127.0.0.1:30090/notices
kubectl logs monitor --tail=5
```
Expected: version 1.1.0, student 02230158, `"pinnedFirst":true`, monitor lines `OK`.

`manifests/rolling/` is the history of Tasks 3, 5, 6 and is NOT part of the final state. `scripts/summarise.sh <log>` summarises a monitor log.

## Clean-up
```
kubectl config set-context --current --namespace=default
kind delete cluster --name cte412-02230158
```
