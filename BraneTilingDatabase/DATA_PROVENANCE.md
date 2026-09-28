# Brane Tiling Database: attribution and verification

The scientific dataset is by **Rak-Kyeong Seong and Benjamin Suzzoni** and is
distributed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
Please retain the dataset attribution and the references supplied with copied
or downloaded records. The archival DOI is pending; no DOI is claimed here.

Source: https://www.benterre.com/BraneTilingDatabase/

Data service: https://branetilingdatabase.benterre.com/

Public access is intentional. Cooperative AI-crawler exclusions and bounded
API requests discourage indiscriminate collection but cannot prevent scraping
or force attribution into a third party's output. They do not change the
dataset's CC BY license or block ordinary scientific clients.

## Signed releases

Each signed release provides `RELEASE_PROVENANCE.json`, its detached Ed25519
signature `RELEASE_PROVENANCE.sig`, and `RELEASE_SIGNING_PUBLIC_KEY.pem`.
The signed manifest identifies the release, authors, license and exact hashes
of the dataset files. Scientific values are not watermarked or modified.

The maintainer's public signing-key fingerprint (SHA-256 of its raw 32 bytes) is:

```
66e2b3b3b60aae490756f4efeec4d6389de6b740430004c74b332d20befebd4e
```

Pin this fingerprint through a trusted copy of the maintainer's website or
archival deposit before verifying. A key downloaded beside an untrusted
signature proves self-consistency, not the identity of its author.

The API and browser exports include provenance and release identifiers. A
response SHA-256 is an integrity fingerprint, **not** an independently signed
proof of a subset. To audit a subset cryptographically, verify the signed
underlying file and compare its decoded record. The webapp does not claim to
have independently verified release signatures in the browser.

Implementation and offline verification instructions are in
`deploy/PROVENANCE.md` in the database source repository. Keep private signing
keys offline; only the public key and signed release artifacts are published.
