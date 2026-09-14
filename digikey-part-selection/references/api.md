# DigiKey Product Information API

Checked against official documentation on 2026-09-09. The helper uses Python
3.10+ standard library only and makes one catalog request per invocation unless
it can reuse a local cache. It never orders parts or writes an Altium library.

## Authentication and endpoints

Load the two environment variables described in [credentials](credentials.md).
Product Information V4 supports the client-credentials OAuth flow: POST a form
containing `grant_type=client_credentials`, `client_id`, and `client_secret` to
`https://api.digikey.com/v1/oauth2/token`. Keep the resulting access token in
memory and respect `expires_in`; the one-request helper obtains a token only
when it needs a live request. Do not persist tokens or authentication headers.
See [DigiKey's two-legged flow](https://developer.digikey.com/tutorials-and-resources/oauth-20-2-legged-flow).

The helper targets production `https://api.digikey.com`:

| Operation | Method and path | Input |
| --- | --- | --- |
| Discovery | POST `/products/v4/search/keyword` | JSON `Keywords`, `Limit`, `Offset` |
| Exact product detail | GET `/products/v4/search/{partNumber}/productdetails` | URL-encoded MPN or DigiKey SKU |

Catalog headers are `Authorization: Bearer …`, `X-DIGIKEY-Client-Id`, and locale
headers `X-DIGIKEY-Locale-Site`, `X-DIGIKEY-Locale-Language`, and
`X-DIGIKEY-Locale-Currency`; the helper defaults to US/en/USD. JSON POSTs also
set `Content-Type: application/json`. Part numbers containing `/`, `#`, or other
special characters must be encoded as a single path segment.

Keyword search is for discovery. Use ProductDetails for the final candidate,
preferably by exact DigiKey SKU to disambiguate packaging. Search does not provide
all detailed/pricing fields. Consult the current
[ProductSearch V4 reference](https://developer.digikey.com/products/product-information-v4/productsearch?page=0)
for advanced filters, category/manufacturer IDs, pricing operations, and schemas.
Inspect response fields instead of assuming a search result has details fields.

## Commands

From this skill directory, with credentials already injected:

```sh
python scripts/digikey.py --keyword "0402 10k 1% resistor" --limit 20 --output /path/to/project/search.json
python scripts/digikey.py --details EXACT_DIGIKEY_SKU --refresh --output /path/to/project/details.json
```

On Windows, the optional launcher is described in [credentials](credentials.md). The
`--output` parent must already exist. Output is a JSON envelope with `source`
(`api` or `cache`), `checked_at` (UTC), the request, rate-limit metadata, and the
API response. The helper does not choose a part or infer specifications.

Default cache: `~/.cache/codex/digikey`; override with `--cache-dir`. A cache hit
requires no credentials and keeps the original retrieval time. `--refresh`
bypasses only the local cache. DigiKey says KeywordSearch can be cached for up
to 24 hours; use ProductDetails for current pricing and availability. Sandbox
data can differ from real products and is unsuitable for purchasing decisions.
See the [official FAQ](https://developer.digikey.com/faq).

For pagination use `--offset` and `--limit` (1–50). Earlier catalog requests
encountered an `Offset + Limit <= 300` search window; narrow a broad query if the
server rejects deeper pagination. This was observed behavior, not an assumption
that every endpoint or future plan has the same limit.

## Quotas and failures

DigiKey documents a standard Product Information allowance of 1,000 calls/day
and 120/minute; the actual application subscription and returned headers govern.
Inspect `X-RateLimit-*`, `X-BurstLimit-*`, and `Retry-After`. Keep some daily budget
for final candidate checks instead of exhausting it during discovery. The helper
does not automatically retry 401, 403, 429, or transient failures. Fix credentials
or access for 401/403; for 429 honor the returned reset/retry time and retain the
partial research. Do not assume a midnight reset if none is provided.
See [DigiKey shared concepts](https://developer.digikey.com/tutorials-and-resources/shared-concepts).

Error output intentionally omits response bodies and credentials. Check the
HTTP status, non-secret rate metadata, application subscription, and official
documentation before debugging more deeply. Never log a token request, full
environment, or authenticated request headers.

## Helper validation

Run the offline suite from the repository root:

```sh
python -m unittest discover -s digikey-part-selection/tests -v
```

The tests cover authentication request construction, credential-free cache reuse,
locale isolation, URL encoding, refresh behavior, invalid input, and quota/error
handling. Network requests are mocked; these checks do not establish live access,
current quotas or product availability for a user's application.
