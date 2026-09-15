# Isolated Railway staging infrastructure

Run `npm ci` and Railway commands from `web`. The SDK requires Node 22 or newer
and Railway CLI 5.42.1 or newer. Link the existing HrizonMedia project to the
`staging` environment before running:

```sh
railway config plan
railway config apply
```

The definition refuses other environments and keeps secrets on Railway through
`preserve()`. Review the plan before applying; no production resources belong here.
The imported database, volume and bucket retain their existing staging identities.

On Windows with the CLI launched through `npx`, set `$env:_` to the full path of
its native `railway.exe` before plan/apply. The SDK uses that executable to check
the CLI version.

See [the staging runbook](../RAILWAY.md) for variables, deployment, private database
tunnels and destructive fixture opt-in.
