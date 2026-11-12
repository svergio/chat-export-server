# Kubernetes (`chat-export` namespace)

Local-first deployment for self-hosted clusters (Colima K8s, k3s, kind, MicroK8s). Data persists on PVC at `/data` (`CHAT_EXPORT_HOME`).

## Secrets

Create secrets before applying (never commit plaintext tokens):

```sh
kubectl create namespace chat-export --dry-run=client -o yaml | kubectl apply -f -

kubectl -n chat-export create secret generic chat-export-secrets \
  --from-literal=CHAT_EXPORT_ADMIN_USER=admin \
  --from-literal=CHAT_EXPORT_ADMIN_PASS='YOUR_STRONG_ADMIN_PASSWORD' \
  --from-literal=CHAT_EXPORT_MCP_TOKEN='cem_YOUR_MCP_TOKEN' \
  --from-literal=CHAT_EXPORT_BROWSER_TOKENS='b-main:ceb_YOUR_BROWSER_TOKEN:Chrome Main' \
  --dry-run=client -o yaml | kubectl apply -f -
```

See [`secret.example.yaml`](secret.example.yaml) for key names.

## Apply

```sh
kubectl apply -k deploy/k8s
kubectl -n chat-export rollout status deploy/chat-export-server
kubectl -n chat-export get pvc,pods,svc
```

## Loopback access (recommended)

Do not expose the service on a public Ingress without authentication. Forward to local loopback where Chrome and MCP clients run:

```sh
kubectl -n chat-export port-forward --address 127.0.0.1 svc/chat-export-server 8765:8765
```

Then use `http://127.0.0.1:8765/health`, `/dashboard/`, and `/mcp` as on a native install.

Optional [`ingress.yaml`](ingress.yaml) is commented out in `kustomization.yaml`; enable only on private clusters.
