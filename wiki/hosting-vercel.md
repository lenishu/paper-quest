# Hosting on Vercel

PaperQuest runs on Vercel with a Vite frontend, a Node.js API function, and PostgreSQL storage. Snowflake Postgres and Neon both use the existing database adapter. Local development continues to use files in `data/`.

## Deployment

1. Import the repository into Vercel with the **Vite** preset and the repository root as the root directory.
2. Provision PostgreSQL and configure the connection as a sensitive server-side environment variable.
3. Configure Google sign-in and the environment variables described in the [README](../README.md#deploy-to-vercel).
4. Deploy after setting environment variables. Changes to variables apply to new deployments.

`vercel.json` supplies `VITE_CLOUD=true npm run build`, the `client/dist` output directory, API routing, and a 300-second function duration. API requests use `api/index.mjs`; other paths serve the frontend.

## Snowflake Postgres

In Snowsight, open **Postgres** and create an instance. A small burstable instance is suitable for initial testing. Compute and storage consume the account's available trial balance or paid credits; monitor usage in Snowflake.

Configure an instance network policy for the application's outbound connections and an application database login with access limited to PaperQuest. Keep administrative credentials separate from the deployed application. Use a PostgreSQL connection string with TLS certificate verification:

```text
PAPERQUEST_DATABASE_URL=postgresql://APP_USER:URL_ENCODED_PASSWORD@HOST:5432/paperquest?sslmode=verify-full
```

Store the actual value in Vercel's sensitive environment-variable storage. Snowflake Postgres is distinct from a Snowflake SQL warehouse: warehouse credentials and SQL API endpoints cannot be used as PostgreSQL connection strings.

In **Postgres → Account Actions → Download Certificate**, download the account's public root CA. Add the complete PEM contents as `PAPERQUEST_DATABASE_CA` in Vercel, including the BEGIN/END lines. Multiline text and literal `\n` separators are supported. When this variable is set, the adapter uses it to verify both the certificate chain and the database hostname, overriding SSL options in the connection URL. See [Snowflake SSL certificates](https://docs.snowflake.com/en/user-guide/snowflake-postgres/postgres-ssl-certs).

See [Snowflake Postgres setup](https://www.snowflake.com/en/developers/guides/getting-started-with-snowflake-postgres/) and [network configuration](https://docs.snowflake.com/en/user-guide/snowflake-postgres/postgres-network).

## Connection selection

The server uses the first configured variable:

1. `PAPERQUEST_DATABASE_URL`
2. `DATABASE_URL`
3. `POSTGRES_URL`

The dedicated override allows a provider change while retaining a managed integration's original variables for recovery. A Neon Marketplace connection typically supplies `DATABASE_URL`.

The application creates `paperquest_blobs` on first use. Each row stores a value and a revision. Conditional writes use atomic PostgreSQL statements to preserve workspace isolation and reject conflicting changes. Large encrypted values are cached within a function instance, but every read checks the database revision before reusing a cached value.

## Migrating existing data

For a complete migration, copy all `paperquest_blobs` rows to the destination, preserving keys, values, and revisions. Retain the original `PAPERQUEST_AUTH_SECRET`; it protects account mappings and shared snapshots. Verify destination data before changing the production connection, and retain the source until the migration is confirmed.

If the source database is unavailable, a project backup can restore documents and saved learning content, but it does not contain all cloud account records, judge keys, career data, or later edits. Keep the original database available for subsequent recovery. When starting a replacement account store without its prior session-revocation records, set a new `PAPERQUEST_SESSION_EPOCH` so users must authenticate again.

To stage a validated project backup for the approved developer account, configure the destination connection and the deployed authentication secret in a private environment, then run:

```bash
node --env-file=.env.migration scripts/stage-developer-backup.js /path/to/paperquest-projects-backup.json
```

This stores an encrypted backup. The next authenticated developer session restores missing project folders while preserving existing folders and newer progress. Recovery receipts prevent deleted projects from being repeatedly restored.

## Google sign-in

Register the deployment's exact origin and callback in Google Auth Platform:

- Authorized JavaScript origin: `https://your-project.vercel.app`
- Authorized redirect URI: `https://your-project.vercel.app/`

Register custom domains separately. The full-page account chooser requests OpenID Connect identity only and uses a single-use server challenge. Account sessions use secure, HTTP-only cookies. Changing `PAPERQUEST_SESSION_EPOCH` invalidates account sessions without rotating the encryption secret.

## Verification

- Check `/api/session`, then access a workspace endpoint such as `/api/projects`. A successful guest session alone does not verify storage connectivity.
- Create a project, upload a document, and reload to confirm persistence.
- Confirm a separate browser workspace cannot read the first workspace's data.
- Sign in with Google and confirm developer projects and account switching.
- Open a saved lesson and the knowledge graph, then verify judge access with a read-only snapshot.

Hosted uploads are limited to 4 MB each and workspaces to 24 MB. AI and upload jobs run after the initial response using Vercel's `waitUntil`. Review Vercel function limits and the database provider's compute, storage, and transfer usage as traffic grows.

When storage is unavailable, the app shows an error and retry controls. Inspect deployment logs and the database console for connection failures or exhausted quotas before retrying writes.
