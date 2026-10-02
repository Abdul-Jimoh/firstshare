#!/usr/bin/env bash
# Ships the runner to the eu-central-1 box: bundle → private S3 → one-hour presigned link → SSM install + restart.
set -euo pipefail
cd "$(dirname "$0")/../../.."
REGION=eu-central-1
INSTANCE=${RUNNER_INSTANCE:-i-02de1a5a87e9fa2c1}
BUCKET=${RUNNER_BUCKET:-firstshare-deploy-040949441028}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

COPYFILE_DISABLE=1 tar --exclude node_modules -czf "$TMP/runner.tgz" \
  package.json package-lock.json tsconfig.base.json \
  packages/core/package.json packages/core/tsconfig.json packages/core/src \
  apps/runner/package.json apps/runner/tsconfig.json apps/runner/src apps/runner/deploy \
  apps/web/package.json
aws s3 cp "$TMP/runner.tgz" "s3://$BUCKET/runner/runner.tgz" --region $REGION --quiet
URL=$(aws s3 presign "s3://$BUCKET/runner/runner.tgz" --region $REGION --expires-in 3600)

python3 - "$URL" > "$TMP/params.json" <<'PY'
import json, sys
print(json.dumps({"commands": [
  "set -euo pipefail",
  "rpm -q nodejs22 >/dev/null || dnf install -y nodejs22 nodejs22-npm >/dev/null",
  "ln -sf /usr/bin/node-22 /usr/local/bin/node; ln -sf /usr/bin/npm-22 /usr/local/bin/npm",
  "id runner >/dev/null 2>&1 || useradd --system --create-home --shell /sbin/nologin runner",
  "mkdir -p /opt/firstshare && cd /opt/firstshare",
  f"curl -fsSL '{sys.argv[1]}' -o /tmp/runner.tgz",
  "find /opt/firstshare -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +",
  "tar -xzf /tmp/runner.tgz -C /opt/firstshare && rm /tmp/runner.tgz",
  "npm ci --workspace @firstshare/runner --include-workspace-root --no-audit --no-fund --loglevel=error",
  "chown -R runner:runner /opt/firstshare",
  "cp apps/runner/deploy/firstshare-runner.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable firstshare-runner",
  "systemctl restart firstshare-runner && sleep 20 && systemctl is-active firstshare-runner && journalctl -u firstshare-runner -n 15 --no-pager",
]}))
PY
CID=$(aws ssm send-command --region $REGION --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "deploy firstshare runner" --parameters "file://$TMP/params.json" --query Command.CommandId --output text)
aws ssm wait command-executed --region $REGION --command-id "$CID" --instance-id "$INSTANCE" || true
aws ssm get-command-invocation --region $REGION --command-id "$CID" --instance-id "$INSTANCE" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
