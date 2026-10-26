# Operations, registration and measurement

**Update October 26:** SSH access works through the existing `vps` alias and its configured server key. Live web/API are v1.3.0. Actual Caddy configuration and active JSON were acquired and matched; the main-domain sitemap still returns HTML. A minimal candidate passed installed Caddy v2.11.4 validation and 132 adapted-route checks, without apply/reload. See [L08 evidence and release prerequisites](../design/first-visit-seo/implementation-l08.md). The October 25 SSH-blocked statement below is historical. Fresh encrypted backup/isolated restore, Git publication, application release and separate Caddy application remain pending.

**Current correction, October 25:** the owner rejected supplemental SEO blocks/link lists in the approved drawer. See [the correction and superseded acceptance claims](drawer-correction-2026-10-25.md). Existing discovery/entity initial bodies and bounded inventory discovery are deferred; earlier local artifacts/results below describe the prior candidate. No release is approved.

Date: October 25, 2026. Five workstreams remain separate; local checks authorize no production or external-account mutation.

## 1. Repository work

Shared typed public documents extend the existing API shim and React routes. No framework migration or database schema migration. Use the verification report for candidate gates and artifact identities. UI/device acceptance remains owner-owned under CLAUDE.md §6.

## 2. VPS/Caddy — blocked until actual config is available

SSH attempt using the previously recorded deployment target failed with `Permission denied (publickey)`. Upstreams, invocation, mounts, version and active images are unknown. This document is a pending runbook, **not an applicable Caddyfile or exact candidate diff**.

Route ownership to verify against the running configuration before preparing any patch:

| Main-domain request | Owner / requirement |
| --- | --- |
| /sitemap.xml, GET/HEAD | API sitemap, explicit matcher; application/xml |
| /, /about, /gallery, /buy-surf-photos, /sell-surf-photos, GET/HEAD | API public document shim, same behavior for all user agents |
| /{valid nonreserved spotSlug}, /{spotSlug}/gallery, /{spotSlug}/session/{id}, GET/HEAD | API shim; proper 404/308/empty noindex; no broad matcher before static/private exclusions |
| /robots.txt | Web file; never API blanket-disallow response |
| /index.html | Web file, never shim (shell-fetch recursion protection) |
| /assets/*, icons, public images, manifest, /release.txt | Web unchanged; immutable hashes, real missing-asset 404 |
| /cart, /checkout/*, /upload, /me/*, /admin, /auth, /order-success | Web SPA, X-Robots-Tag noindex, nofollow on document responses |
| /healthz and currently configured health paths | Preserve verified current owner |
| API-origin /api/auth/*, /api/trpc/*, /api/health, /api/webhook/* | Existing API owner, paths, methods, CORS, cookies and webhook behavior unchanged |
| Other methods/paths | Preserve current verified behavior; do not treat POST as a public document |

Read-only acquisition, by infrastructure owner: identify service/container first; inspect only Swelldays routing and relevant imports (redact secrets/unrelated sites). For a host service inspect `systemctl show caddy -p FragmentPath -p ExecStart -p ExecReload`; for Docker inspect selected container command, mounts and network names, **not environment values**. Obtain installed `caddy version`, real config path, imported files and web/API reachability in that execution context. Do not assume compose service names work from an external Caddy container.

Once evidence exists, prepare an exact minimal unified diff with explicit static/private precedence, separate sitemap handling and document shapes. Use `handle`, preserving methods/paths; `handle_path` strips prefixes and is unsuitable here. Confirm new static slugs do not collide (public spots audit: 22 returned, no collisions with reserved paths on October 25).

Production preparation needs explicit owner approval. After approval, create a timestamped access-controlled backup of the actual config **and its imports** (`umask 077`, mode 600 where applicable), record hash, ownership, location and retrieval/restore method. Do not invent a backup path in advance. Validate the complete candidate using the installed binary/container and actual network/mount context:

```sh
caddy validate --config <verified-candidate-path> --adapter caddyfile
```

Present exact diff, validation output, backup manifest, restore commands, approved application artifacts and exact graceful reload action. Only then request approval to apply. Host and container invocations differ; do not blindly run systemctl or replace the entire config. Prefer verified graceful reload over restart.

Rollback after an approved failure: restore task backup files with original owners/modes, validate the restored full config, invoke the verified reload action, then repeat HTTP smoke tests. Preserve unrelated sites/imports. Until acquisition and rehearsal, Caddy rollback is **pending**, not verified.

## 3. Google Search Console and Bing — account owner checklist

Perform only after approved deployment and main-domain sitemap/public-document checks pass, with explicit account authorization.

1. Identify authorized account and inspect existing Google/Bing properties; avoid duplicates. Current account ownership/indexing evidence is unavailable.
2. Google Domain property: DNS TXT verification through DNS owner. For a URL-prefix property use an actually supported method, including approved HTML tag/file if chosen. No fabricated token; verification tags/files are public but credentials stay private.
3. Approved tags/files must survive both Nginx shell delivery and shim injection. Verify `/index.html`, `/`, buyer and seller; do not remove existing unrelated verification.
4. Verify Bing ownership or explicitly approved Google import. Record property and verification evidence separately from submission.
5. Submit **https://swelldays.surf/sitemap.xml** to verified properties. Record receipt/status/time. Submission is not indexing.
6. Inspect home, buyer, seller, gallery, one nonempty spot and one published session: fetch/render, eligibility, declared/selected canonical, exclusions and mobile rendering.
7. Request indexing for a small sensible initial set. Do not use Google Indexing API for ordinary marketplace pages. IndexNow is optional follow-up, not a ranking mechanism.
8. Roll back only task-owned verification changes when approved; removing verification can revoke ownership. Never disturb existing records/tokens.

Google Rich Results Test and generic schema validation: owner to validate deployed representative routes, recording supported/unsupported types separately. No rich-result guarantee. Current external validator results pending.

## 4. Editorial and legitimate authority

| Priority | Original content | Evidence and maintainer | Links / acceptance |
| --- | --- | --- | --- |
| P0 | Find a session by spot/date | Product owner, actual discovery UI | Buyer → gallery → real sessions; no guaranteed availability |
| P0 | Previews vs purchased originals | Fulfillment owner, supported purchase/download behavior | Buyer FAQ and purchases help; do not reveal download tokens |
| P0 | Publish and price a photographer session | Upload owner, real workspace workflow | Seller → upload; original screenshots only with approved rights |
| P0 blocker | Fees, payout threshold/process, refunds and rights | Commercial owner confirms current provider/terms and maintains them | Approve before external publication; no unsupported timing or earnings claims |
| P1 | Location guide with actual inventory | Named local photographer/editor; first-hand location knowledge and image rights | Existing spot/session links; no mass thin geographic pages |
| P2 | Creator portfolios and community stories | Photographer permission, original material and credits | Real partnerships, surf schools and earned coverage; no purchased links/fake testimonials |

No outreach, external publishing, copied comparisons or manufactured reviews performed. Content requires assigned maintenance responsibility and a fact-review date.

## 5. Approved deployment and observation

Release workflow is tag-triggered (`v*`) and publishes web/API/migrator images, runs migrations and deploys. **Do not tag/push it without explicit approval.** It prunes unused VPS images, so retain previous usable immutable registry artifacts and their compose configuration; local old images cannot be assumed available.

Before release: recheck clean/dirty state, upstream and exact approved range; verify live release and active image digests; exclude unrelated changes; test/build exact candidate. Although this task has no schema migration, it changes backend queries, so obtain and verify a fresh access-controlled database backup and isolated restore under [deployment.md](../deployment.md) before deployment. Inspect archive listing and isolated restoration; never test a restore into production.

Treat application deployment and Caddy application as separate approvals. Compatible order: deploy web/API support first (index.html remains web-owned); verify API shim against the new shell and web private headers; then apply the independently validated Caddy diff. No account submission until live checks pass.

After approved application/config: release.txt and actual deployed image identity; API health; assets/compression/cache and missing-asset 404; robots/manifest/icons; main sitemap XML; all raw public route types; correct one canonical/social/schema/H1/anchors; unknown/malformed/wrong-slug routes; private noindex on GET/HEAD; API robots; authenticated routing and checkout entry without purchases; crawl sitemap and public links; owner mobile acceptance. Record each result, not just CI/tag existence.

Rollback application: restore verified previous compose file and immutable usable web/API artifacts, pull and start only approved services using the documented production invocation. This task has no schema rollback; an application rollback is not a database restore. Caddy rollback is separate as above; restore its verified previous routing before reverting to application images that do not implement the new public document paths. Verify compatibility at each step.

### Measurement definitions

Existing system: Cloudflare Web Analytics beacon in index.html. No additional tracker installed; custom event/funnel support is not assumed. No consent or privacy behavior changed. Search Console/Bing and Cloudflare account data unavailable: baseline impressions/clicks/CTR/position/organic conversions/CWV are **unavailable**, not zero.

| Metric / event | Trigger / numerator | Denominator / source / owner |
| --- | --- | --- |
| Ownership / sitemap processing | Verified property; accepted and processed sitemap status | Google/Bing properties; site owner |
| Indexed spots/sessions | Indexed canonical public URLs, exclusions by reason | Submitted eligible inventory; Google/Bing, SEO owner |
| Query/page impressions, clicks, CTR, avg position | Actual tool metrics, query/page/device/country segments | CTR = clicks/impressions; position is an average, not a universal fixed rank |
| Organic landing visits | Attributed organic-search landings | Consistently defined analytics sessions/visits; analytics owner confirms available dimensions |
| Buyer CTA | One deliberate activation of “Find my surf photos” leading to gallery | Eligible buyer landing views; proposed event, **not instrumented** |
| Photographer CTA | One deliberate “Start uploading” activation | Eligible seller landing views; proposed event, **not an upload** |
| Upload completion | Confirmed server publication | Started authenticated upload workspaces; only if reliably measurable |
| Purchase completion | Confirmed paid fulfillment, deduped by server order identity | Relevant checkout attempts; never client return alone |
| CWV | Field p75 LCP/INP/CLS | CrUX or approved RUM with sufficient samples; lab scores are separate |

If custom events are later authorized: allowlist event names and route categories; do not send identity, email, raw query strings, payment/order/download tokens, private media IDs or URLs. Deduplicate one activation once, keyboard and pointer equivalent; server outcomes use idempotent records. Inspect current consent requirements before adding tracking. Test privacy/dedup and measure bundle cost before shipping.

Review at 2/4/8/12 weeks after actual release (set calendar dates then): sitemap/canonical exclusions first, then query/page/device/country trends and conversion definitions. Assign site owner to supply account exports and SEO owner to interpret. Search changes can take weeks/months; no forecast or ranking guarantee.
