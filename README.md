# QR Studio — Professional Edition

A responsive, static QR-code workspace. QR payloads are generated in the browser; this project has no application account system, database or QR-generation backend.

## Features

- QR content: URL, plain text, Wi-Fi, email, phone, SMS, vCard and WhatsApp.
- Custom colors, two-color gradient, dot patterns, error-correction level, export dimensions and optional logo.
- PNG, SVG and PDF export.
- Bulk QR generation (up to 50 lines) and ZIP download.
- Camera scanner (HTTPS or localhost and user permission required).
- Recent history in browser local storage (maximum 12 entries); Wi-Fi and vCard payloads are intentionally not saved.
- Automatic system light/dark theme with manually selected preference saved across pages.
- Scan-safety warnings (contrast, inverted colours, logo + error correction).
- Privacy Policy, About, Terms of Use and this documentation.

## Run locally

1. Extract the ZIP.
2. Run a local static server in the project folder, for example `python3 -m http.server 8000`.
3. Open `http://localhost:8000`.

All libraries are bundled in `vendor/`, so no internet connection or CDN is needed. Camera scanning requires HTTPS or localhost; do not rely on `file://`.

## Deploy

Upload every file in this folder (including `vendor/`, `_headers` and `.well-known/`) to the root of a static HTTPS host. Netlify and Cloudflare Pages apply `_headers` automatically. On other hosts, set the same response headers yourself (see below). GitHub Pages cannot set custom headers; the CSP `<meta>` tags still apply there, but `frame-ancestors`, HSTS and `X-Frame-Options` cannot be enforced.

## Bundled dependencies (`vendor/`)

| Library | Version | Licence | Purpose |
|---|---|---|---|
| qr-code-styling | 1.6.0 | MIT | QR rendering, PNG/SVG |
| jsPDF | 2.5.1 | MIT | PDF export |
| JSZip | 3.10.1 | MIT or GPL-3.0+ | Bulk ZIP |
| html5-qrcode | 2.3.8 | Apache-2.0 | Camera scanner |

Files are the unmodified npm release builds (only trailing `sourceMappingURL` comments removed). Licence texts are next to them. When upgrading, replace the file, review the library's changelog/advisories and re-run the manual tests below.

## Security model

- **Strict CSP** on every page: `script-src 'self'`, `style-src 'self'`, no inline scripts or styles, no third-party origins, `object-src 'none'`, `form-action 'none'`.
- **No third-party requests** at runtime (no CDN, fonts, analytics or trackers). QR content never leaves the browser.
- **Input validation**: URLs are restricted to `http(s)` (auto-prefixing `https://`); email, phone and WhatsApp numbers are validated; vCard and Wi-Fi fields are escaped per their formats; email subject/body are percent-encoded; content length is checked against the real QR byte capacity for the chosen error-correction level.
- **No unsafe DOM writes**: user content is only ever inserted with `textContent`; scanned results go into a read-only textarea and are never opened automatically.
- **Local storage**: history keeps at most 12 entries. Wi-Fi and vCard codes are never saved. Storage is unencrypted — use "Clear history" on shared devices.
- **Stale-export protection**: exports are disabled whenever the form changes after generating, so an outdated code cannot be downloaded by mistake.
- **Scan-safety hints**: warnings for low contrast, inverted colours and logos without High error correction.

### Recommended HTTP headers (already in `_headers`)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()
```

nginx example: `add_header Name "value" always;` for each line above inside the `server {}` block.

## Project owner

- Creator / maintainer: SAAD SHEIKH
- Contact and privacy email: ahmad.saad.8420@gmail.com
- Contact phone: +880 1622-792592
- Official website: No separate website is currently listed.
- The About, Privacy Policy and Terms pages use these details. The phone number is publicly visible on those pages; remove it from them if you prefer not to publish it. The developer biography is intentionally limited to the project role and stated goals; no unverified qualifications or company affiliations are claimed.

## Before publishing — owner actions

1. Confirm that the contact email is active and monitored.
2. Review the Privacy Policy and Terms against the actual hosting provider, jurisdiction, analytics, advertising and other services used. These documents are general informational templates, not legal advice or a compliance certification.
3. Configure the host's HTTP security headers (`_headers`). Keep HTTPS enabled.
4. Check the bundled library versions against current security advisories before each release.
5. Test every QR type and export, all scanner permission paths, mobile/desktop layouts, keyboard accessibility and current Chrome/Firefox/Safari browsers.
6. Scan generated codes with multiple devices before printing or distributing them.

## Known limitations

- Local history cannot securely store secrets and is deliberately not encrypted.
- Bulk generation treats each non-empty line as plain text; it does not infer the specialised QR type.
- The project does not include server-side accounts, analytics, support forms, email delivery or cloud synchronization.
- Hosting-specific disclosures and jurisdiction-specific legal clauses should be reviewed by the site owner before deployment.
