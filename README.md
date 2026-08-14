# MYnyak Engsel WebUI

WebUI port of `me-cli-sunset` (XL/Axis Indonesia CLI client) as a **Cloudflare Worker**.
Crypto + XL API client ported from Python (`crypto_helper.py`, `encrypt.py`, `engsel.py`,
`ciam.py`, `purchase/*`, `store/*`, `circle.py`, `famplan.py`) to Web Crypto + `fetch`.
Sessions/bookmarks stored in Workers KV.

## Structure
- `src/crypto.js` — AES-CBC (XDATA, circle MSISDN, encrypted field, fingerprint) + HMAC signatures. Web Crypto port.
- `src/xl.js` — XL API client (profile, balance, store, packages, circle, family plan, purchase/settlement, dukcapil).
- `src/store.js` — KV-backed accounts + bookmarks.
- `src/index.js` — Worker router (REST API + static UI).
- `src/ui.js` — inlined vanilla-JS WebUI (HTML + JS).

## Local dev
```bash
npm install
npx wrangler dev --config wrangler.jsonc --port 8787
# open http://localhost:8787
```
> Note: on some Windows setups `wrangler dev` fails with `spawn EFTYPE` (miniflare/workerd).
> The Worker logic is covered by `test-worker.mjs` and `test-crypto.mjs` (run with `node`).

## Deploy
1. Create a Cloudflare API token with Workers + KV permissions, then:
   ```bash
   $env:CLOUDFLARE_API_TOKEN = "your-token"
   ```
2. Create the KV namespace and copy the ID into `wrangler.jsonc` (`kv_namespaces[].id`):
   ```bash
   npx wrangler kv namespace create MEKV
   ```
3. Deploy:
   ```bash
   npx wrangler deploy --config wrangler.jsonc
   ```

## Secrets / env
All XL keys live in `wrangler.jsonc` `vars` (the values you provided). They are non-secret
config here; for production move them to `wrangler secret put` instead of `vars`.

## Tests
```bash
node test-crypto.mjs   # crypto round-trips (encrypt/decrypt, signatures, fingerprint)
node test-worker.mjs   # router + KV store + auth gating (no network)
```

## Notes / skipped
- Decoy packages: not ported (needs `decoy_data/*.json` + per-subscriber fetch). Add when needed.
- Sentry mode (quota polling) and `purchase_n_times` loop: not in WebUI. Add as a background endpoint if wanted.
- QRIS shows the raw `qr_code` string; render client-side if you want an image.
- `nodejs_compat` enabled for `node:crypto` MD5 (device id). On Workers runtime MD5 is also available via `crypto.subtle`? No — kept `node:crypto`.
