# scripts — deploy

`npm run deploy` buduje (`vite build`) i wysyła `dist/` przez FTP
(`deploy.mjs`, `basic-ftp`) na `https://onlypaths.pluzz.pl` (cPanel,
Apache). `npm run deploy:check` — łączy się, weryfikuje certyfikat, listuje
katalog zdalny, niczego nie wysyła. Slash command `/deploy` odpala
`npm run deploy` (lokalny, `.claude/` poza gitem).

- Domyślnie explicit FTPS (`AUTH TLS`, port 21); `FTP_SECURE=false` w
  `.env` — awaryjny plain FTP. Certyfikat **zawsze weryfikowany** (bez
  opcji wyłączenia — hasło i podmiana JS).
- Warunki weryfikacji na tym hostingu: `FTP_HOST=v101.vh.net.pl`
  (certyfikat `*.v101.vh.net.pl`; `ftp.vh11566.vh.net.pl` to ten sam
  serwer, ale spoza certyfikatu) oraz dołożony łańcuch Let's Encrypt —
  serwer wysyła tylko certyfikat końcowy, więc pośredni YR1 i cross-sign
  ISRG Root YR ↔ X1 leżą w `certs/lets-encrypt-yr1-chain.pem` (ważne do
  2028/2032), ufane obok rootów Node; `FTP_CA_FILE` nadpisuje przy zmianie
  wystawcy. Przy błędzie weryfikacji skrypt podpowiada oba warunki.
- Kolejność: nowe pliki do `assets/` (obok starych) → reszta roota
  (`.htaccess`, `robots.txt`, `favicon.svg`) → **`index.html` na końcu** →
  usunięcie z `assets/` plików spoza nowego buildu. Przerwany upload
  zostawia działającą poprzednią wersję.
- Dotyka wyłącznie plików z `dist/` — **nigdy pełny `clearWorkingDir()`**:
  root zawiera pliki cPanelu (`cgi-bin/`, `php.ini`, `.user.ini`,
  `.well-known/`).
- Konto FTP `claude@onlypaths.pluzz.pl` — katalog domowy musi być rootem
  subdomeny (domyślnie cPanel ustawia podfolder `claude/`).
- Dane w lokalnym `.env` (gitignored, szablon `.env.example`), czytane przez
  `node --env-file=.env` (Node ≥ 20.6).
- `public/robots.txt` (`Disallow: /`) na czas testów; `public/.htaccess` —
  roczny niezmienny cache tylko dla `/assets/`, doba dla `favicon.svg`,
  `no-cache` dla `index.html`. Brak CI/CD (`BL-4`).
