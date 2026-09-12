# Public Supabase CA

`supabase-root-2021.crt` is the public CA certificate previously downloaded from the authenticated InfFyn database dashboard's SSL settings. It contains no private key or account credential. It is included so a fresh checkout does not depend on a certificate copied to one developer's machine.

SHA-256 of the exact file: `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`.

The setup script verifies this fingerprint and certificate validity, then copies it outside the repository for PostgreSQL tooling. Existing mismatched files are not overwritten. PostgreSQL still uses `verify-full`; this file is not installed into the operating system trust store. Certificate rotation requires a separately reviewed replacement or an explicitly supplied trusted `-RootCertificate`.

Official procedure: https://supabase.com/docs/guides/platform/ssl-enforcement
