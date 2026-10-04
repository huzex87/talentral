# Public credential verification API

Employers, funders and other systems can check a Talentral certificate without a person opening the verification page.

## Request

```
GET https://talentral.ng/api/v1/public/credentials/{certificate number}
```

The certificate number is printed on the certificate and under its QR code, for example `TAL-KIR-26-6J8WXD` (case does not matter). No key is needed. Any website may call it from the browser (CORS is open). Each address can make 60 requests a minute (`PUBLIC_API_PER_MINUTE`); beyond that the API answers `429` with `Retry-After: 60`.

## Answer

`200` with the credential:

```json
{
  "object": "credential",
  "serial": "TAL-KIR-26-6J8WXD",
  "status": "valid",
  "holder": { "name": "Fatima Bello" },
  "achievement": { "programme": "iDICE Centre of Excellence Cohort 1", "cohort": "Cohort 1", "track": "Software Development",
                   "completed_on": "2026-10-02", "attendance_percent": 92.5, "score_percent": 81 },
  "issuer": { "name": "Kirkira Innovation Hub", "slug": "kirkira", "url": "https://talentral.ng/kirkira" },
  "partners": [{ "name": "iDICE", "role": "funder" }],
  "issued_at": "2026-10-02T15:43:00.000Z",
  "revoked_at": null,
  "revoked_reason": null,
  "verify_url": "https://talentral.ng/verify/TAL-KIR-26-6J8WXD",
  "signature": { "alg": "Ed25519", "kid": "3f1c0a…", "value": "base64url…" }
}
```

`status` is `valid` or `revoked`; a revoked certificate also carries `revoked_at` and `revoked_reason`. An unknown number answers `404` with `{ "error": { "code": "not_found", "message": "…" } }`. The answer contains only what the certificate itself shows.

## Checking the signature

When `CERTIFICATE_SIGNING_KEY` is set, every answer is signed with Talentral's Ed25519 key, so a saved answer can be checked later without trusting the channel it came through.

1. Remove `signature` from the answer.
2. Serialise the rest as canonical JSON: object keys sorted at every level, no spaces (`JSON.stringify` of a key-sorted copy).
3. Fetch the public keys from `GET /api/v1/public/keys` (a JWK set; pick the key whose `kid` matches) and verify `signature.value` (base64url) over the canonical bytes.

```js
import { createPublicKey, verify } from 'node:crypto';
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const { signature, ...credential } = await (await fetch(url)).json();
const { keys } = await (await fetch('https://talentral.ng/api/v1/public/keys')).json();
const key = createPublicKey({ key: keys.find((k) => k.kid === signature.kid), format: 'jwk' });
verify(null, Buffer.from(canonical(credential)), key, Buffer.from(signature.value, 'base64url')); // true
```

## Setting up the signing key

Generate an Ed25519 key once and store the private key as a Vercel **sensitive** environment variable (production only):

```
node -e "const {generateKeyPairSync}=require('crypto');console.log(generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))"
```

Set the output as `CERTIFICATE_SIGNING_KEY`. Without it the API still answers, unsigned, and `/api/v1/public/keys` returns an empty set. Rotating the key changes the `kid`; answers signed with the old key no longer verify, so keep a copy of old public keys if anyone stores signed answers.
