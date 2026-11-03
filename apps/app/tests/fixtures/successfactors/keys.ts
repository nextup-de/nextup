// A throwaway RSA key and self-signed certificate, made with the openssl CLI at test time in os.tmpdir() (D13).
// Nothing is committed and the temp directory is removed before this returns.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestKeys = { privateKeyPem: string; certPem: string };

export function makeTestKeys(commonName = "nextup-sfx-test"): TestKeys {
  const dir = mkdtempSync(join(tmpdir(), "nextup-sfx-"));
  try {
    const key = join(dir, "key.pem");
    const cert = join(dir, "cert.pem");
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", `/CN=${commonName}`],
      { stdio: "pipe" },
    );
    return { privateKeyPem: readFileSync(key, "utf8"), certPem: readFileSync(cert, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
