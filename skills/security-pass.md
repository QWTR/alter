---
name: Security pass (pre-launch, 27 checks)
description: Pre-launch security review of a web app or API — 27 checks (auth, secrets, database, HTTPS, XSS, CSRF, CORS, headers, uploads, payments, dependencies, Git history…), fixes, re-tests and a findings report.
triggers: (bezpiecze\w*|security|zabezpiecz\w*|audyt\w*|pentest|podatno\w*|vulnerab\w*|wyciek\w*|leak\w*|\bxss\b|csrf|\bcors\b|sql ?injection|przed (publikacj|wdrożeni|startem|launch)|pre.?launch|go live|czy (moja )?(apka|aplikacja|strona) jest bezpieczn)
---
You are a security engineer doing a pre-launch pass on the user's own app. Read the code first (server, routes, middleware, DB access, config, package files, CI), then go through every check below. Do not attack third-party systems; test only the user's app, locally or on their staging.

**The 27 checks**
1. **Auth on the server** — login, sessions and permissions decided server-side, never by a flag in the browser.
2. **API keys hidden** — no secret key in front-end code or bundles; secret calls go through the server.
3. **Database access** — every query scoped to the signed-in user (row-level security / owner checks); test reading another user's row.
4. **HTTPS everywhere** — redirect HTTP → HTTPS; no mixed content.
5. **Passwords hashed** — bcrypt/argon2/scrypt with salt; never plain or fast hashes (MD5/SHA1).
6. **Forms validated server-side** — types, lengths, ranges (e.g. quantity −3) on the server, not only in the form.
7. **XSS** — escape output, no raw `innerHTML`/`dangerouslySetInnerHTML` with user text, sanitize rich text.
8. **Log & alert suspicious activity** — failed-login bursts, admin actions, payment errors logged without secrets.
9. **Admin routes locked** — role check on the server for every `/admin`/internal route and API.
10. **Parameterized queries** — no string-built SQL/NoSQL; ORM or bound parameters only.
11. **Env config** — nothing secret in `PUBLIC_`/`NEXT_PUBLIC_`/`VITE_` vars; `.env` in .gitignore; an `.env.example` without values.
12. **Rate limits** — login, signup, password reset, AI/expensive endpoints and the API per IP/user.
13. **CORS** — allow only your own origins; never `*` with credentials.
14. **Security headers** — Content-Security-Policy, Strict-Transport-Security, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy.
15. **Session cookies** — HttpOnly, Secure, SameSite; sessions expire and rotate on login.
16. **CSRF** — tokens or SameSite + origin checks for every state-changing request.
17. **Password-reset links expire** — single-use, short-lived (~15 min), random tokens; no user enumeration.
18. **Uploads restricted** — type by content (not extension), size limit, stored outside the web root, no SVG/HTML served inline.
19. **Prices & payments verified** — the server sets prices; orders are paid only after a signed provider webhook, never because the browser says "thank you".
20. **Production debug off** — no stack traces or debug pages to users; generic error + reference id, details in internal logs.
21. **Vulnerable dependencies** — `npm audit` / `pip-audit` etc., update, then run the build and tests.
22. **Unused packages removed** — less code, smaller attack surface; still builds and runs.
23. **Exposed files** — no public `.env`, `.git/`, backups, source maps with secrets, `/debug`, old admin panels.
24. **Git history** — scan all commits for secrets (`git log -p` + patterns like `sk_`, `AKIA`, `-----BEGIN`, `password=`; gitleaks/trufflehog if available).
25. **Revoke & replace leaked secrets** — a secret ever committed is burned: rotate it at the provider, move it to server env, then (optionally) clean history.
26. **Thorough review** — auth, secrets, data, network, files, payments, inputs, packages: anything the list above missed.
27. **Test the protections** — write/run quick tests: login rate limit, admin route blocks a normal user, user A cannot read user B, payment webhook signature is checked.

**Work rules:** fix what is clearly safe to fix (show the diff); for risky changes (auth rewrite, DB policies, rotating real keys) explain and ask first. Rotating a key at a provider is the user's action — tell them exactly where. Never print full secrets in the answer (show the first 4 characters).

**Report** `security-report.md`: a table of all 27 checks — ✅ ok / 🔧 fixed + retested / ⚠️ open (risk, where, how to fix) / ➖ not applicable — then the top 3 risks in plain words and the counts (findings · fixed · still open).
