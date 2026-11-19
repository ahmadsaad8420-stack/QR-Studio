# QR Studio — Professional Edition

A responsive, static QR-code workspace. QR payloads are generated in the browser; this project has no application account system, database or QR-generation backend.

## Features

- QR content: URL, plain text, Wi-Fi, email, phone, SMS, vCard and WhatsApp.
- Custom colors, two-color gradient, dot patterns, error-correction level, export dimensions and optional logo.
- PNG, SVG and PDF export.
- Bulk QR generation (up to 50 lines) and ZIP download.
- Camera scanner (HTTPS or localhost and user permission required).
- Recent history in browser local storage (maximum 12 entries); Wi-Fi payloads are intentionally not saved.
- Automatic system light/dark theme with manually selected preference saved across pages.
- Privacy Policy, About, Terms of Use and this documentation.

## Run locally

1. Extract the ZIP.
2. Run a local static server in the project folder, for example `python -m http.server 8000`.
3. Open `http://localhost:8000`.
4. Internet access is required for the pinned third-party CDN libraries. Camera scanning works on localhost or HTTPS, subject to browser support and permission.

Do not rely on `file://` for camera scanning or production testing.

## Deploy

Upload the project files to the root of a static HTTPS host (for example GitHub Pages, Cloudflare Pages or another host). Configure the host to serve `index.html` as the site entry point. Test the final deployed domain, because browser security policies and camera permissions depend on the origin and host configuration.

## Dependencies

- `qr-code-styling` 1.6.0 — QR rendering and PNG/SVG output.
- `jsPDF` 2.5.1 — PDF export.
- `JSZip` 3.10.1 — bulk ZIP packaging.
- `html5-qrcode` 2.3.8 — camera scanning.

These are loaded from pinned CDN URLs in `index.html` with Subresource Integrity (SRI) hashes and anonymous CORS enabled. The browser refuses a script whose bytes do not match its pinned hash. The Content Security Policy permits the specific script hosts used by those URLs, including `unpkg.com` for the scanner. SRI reduces CDN tampering risk but is not equivalent to a full supply-chain audit; review dependency advisories and verify hashes whenever a version or file changes.

## Privacy and security notes

- QR content is not encrypted. Never encode passwords, payment details, authentication tokens or other secrets.
- History and the manual theme preference are stored in browser local storage. Local storage is not encrypted and may be accessible to someone with access to the same browser profile.
- Wi-Fi QR payloads are excluded from saved history, but the generated code itself still contains the Wi-Fi details. Clear history and browser site data when needed.
- Camera permission is requested only after the user starts scanning. Scanning requires HTTPS or localhost. Camera use is stopped after a successful scan and when the document becomes hidden.
- The app does not intentionally transmit QR payloads to a QR-generation server. CDN and hosting providers still receive ordinary connection metadata; read their current policies.
- CSP and a camera Permissions Policy are included in the HTML. For stronger deployment security, configure CSP, `Permissions-Policy`, `Referrer-Policy`, `X-Content-Type-Options` and HSTS as HTTP response headers at the hosting layer. A CSP meta element cannot express every directive (notably `frame-ancestors`).

## Project owner

- Creator / maintainer: SAAD SHEIKH
- Contact and privacy email: ahmad.saad.8420@gmail.com
- Contact phone: +880 1622-792592
- Official website: No separate website is currently listed.
- The About, Privacy Policy and Terms pages have been populated with these supplied details. The developer biography is intentionally limited to the project role and stated goals; no unverified qualifications or company affiliations are claimed.

## Before publishing — owner actions

1. Confirm that the contact email is active and monitored.
2. Review the Privacy Policy and Terms against the actual hosting provider, CDN, jurisdiction, analytics, advertising and other services used. These documents are general informational templates, not legal advice or a compliance certification.
3. Configure the host's HTTP security headers. Keep HTTPS enabled.
4. Run dependency and static security scans; verify CDN versions and licenses.
5. Test every QR type and export, all scanner permission paths, mobile/desktop layouts, keyboard accessibility and current Chrome/Firefox/Safari browsers.
6. Scan generated codes with multiple devices before printing or distributing them.

## Known limitations

- Local history cannot securely store secrets and is deliberately not encrypted.
- Bulk generation treats each non-empty line as plain text; it does not infer the specialised QR type.
- The project does not include server-side accounts, analytics, support forms, email delivery or cloud synchronization.
- Hosting-specific disclosures and jurisdiction-specific legal clauses should be reviewed by the site owner before deployment.
