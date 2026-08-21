# Runbook — Secrets

## GitHub OAuth Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Set:
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
3. Copy Client ID and Client Secret
4. Add to `.env`:
   ```
   GITHUB_CLIENT_ID=<client-id>
   GITHUB_CLIENT_SECRET=<client-secret>
   NEXT_PUBLIC_GITHUB_CLIENT_ID=<client-id>
   NEXTAUTH_SECRET=<random-string>
   ```

## AWS Credentials

For AWS mode, configure credentials:

```bash
aws configure
# Or set in .env:
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-2
```

## Secrets Storage

**Note**: For simplicity, this project stores GitHub tokens as base64-encoded
values in the database. Not suitable for production — do not use for real secrets.
