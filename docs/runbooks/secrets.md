# Runbook — Secrets & Security

## GitHub OAuth

1. Create a GitHub OAuth App: Settings → Developer settings → OAuth Apps → New OAuth App.
2. Set:
   - Homepage URL: `http://localhost:3000` (dev) or your prod URL
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Copy the Client ID and Client Secret.
4. Set in `.env`:
   ```
   NEXT_PUBLIC_GITHUB_CLIENT_ID=<client-id>
   GITHUB_CLIENT_ID=<client-id>
   GITHUB_CLIENT_SECRET=<client-secret>
   NEXTAUTH_SECRET=<random-32-char-string>
   JWT_SECRET=<random-32-char-string>
   ```

## KMS Encryption (prod)

In prod, `KMS_KEY_ID` must be set to the ARN of the Terraform-provisioned CMK.
When KMS is configured:
- User GitHub tokens are encrypted with `kms:Encrypt` before storing in RDS
- Project env vars are encrypted with `kms:Encrypt` before storing in RDS
- The orchestrator and build-agent decrypt via the ECS task IAM role

In local mode (`KMS_KEY_ID=""`), the api-server uses a passthrough with a
`dev:` prefix — DO NOT use this for real secrets. This is fine for local
development and demos where all data lives on your machine.

## AWS Credentials

### Local dev
Set in `.env`:
```
AWS_REGION=ap-south-2
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
```

### CI/CD (GitHub Actions)
Uses **AWS OIDC** — no long-lived keys. Configure:
1. GitHub repo → Settings → Actions → General → add identity provider
   `https://token.actions.githubusercontent.com`
2. Create an IAM role with the trust policy:
   ```json
   {"Version": "2012-10-17", "Statement": [
     {"Effect": "Allow", "Principal": {
       "Federated": "arn:aws:iam::<acct>:oidc-provider/token.actions.githubusercontent.com"
     }, "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {"StringEquals": {
         "token.actions.githubusercontent.com:sub": "repo:your-org/vercel:ref:refs/heads/main"
       }}
     }
   ]}
   ```
3. Add `AWS_ROLE_TO_ASSUME` to GitHub secrets.

### ECS Fargate (build-agent)
Uses **task IAM role** — no credentials in env vars. The role is scoped to:
- `s3:PutObject` on the artifacts bucket
- `kms:Decrypt` on the CMK
- `ssm:GetParameter` on `/<name_prefix>/*` SSM params

## SNS Alerts

Subscribe an email to the alerts SNS topic:
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-south-2:<acct>:vercel-clone-prod-alerts \
  --protocol email \
  --notification-endpoint you@example.com
```

## Rotating the Upstash Redis password (from the original build-server)

The original `build-server/script.js` committed an Upstash Redis password to
git history (commit `30f24a0`). To rotate:

1. Log into Upstash console → reset the password.
2. The new code reads `REDIS_URL` from env — no hardcoded credentials.
3. Update `.env` with the new connection string.
4. To scrub history (optional, breaks all existing clones):
   ```bash
   git filter-repo --replace-text <(echo "OLD_PASSWORD==>REDACTED")
   git push --force
   ```