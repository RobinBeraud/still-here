import { createHash, randomBytes } from "node:crypto";

/** Token aléatoire à usage unique (URL-safe, 256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Seul le hash du token est stocké en base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
