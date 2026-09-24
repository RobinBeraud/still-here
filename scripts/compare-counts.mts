/**
 * Compare les comptages de référence (pris juste avant le dump) aux comptages restaurés.
 * Des écritures peuvent survenir entre les deux : on exige restored >= 99 % de la référence
 * (seules de rares suppressions de comptes peuvent faire baisser un compteur).
 */
import { readFileSync } from "node:fs";

const [expectedPath, actualPath] = process.argv.slice(2);
const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, number>;
const actual = JSON.parse(readFileSync(actualPath, "utf8")) as Record<string, number>;

let ok = true;
for (const [table, count] of Object.entries(expected)) {
  const restored = actual[table] ?? 0;
  if (restored < Math.floor(count * 0.99)) {
    console.error(`MISMATCH ${table}: reference ${count}, restored ${restored}`);
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log("✔ restore verified:", actual);
