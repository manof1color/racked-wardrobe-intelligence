import { createHmac, randomBytes } from "node:crypto";

export const PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000;
export const GENERIC_RESET_RESPONSE = "If an account exists for that email, a password-reset link will be sent.";

export function passwordValidationError(password:string) {
  if(password.length<12||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)) return "Use at least 12 characters with uppercase, lowercase, and a number.";
  return null;
}

export function createPasswordResetToken() { return randomBytes(32).toString("base64url"); }
export function passwordResetTokenHash(token:string,secret:string) {
  if(secret.length<32)throw new Error("Password-reset token secret must contain at least 32 characters.");
  return createHmac("sha256",secret).update(token).digest("base64url");
}

export interface PasswordResetState { expiresAt:number; usedAt?:number|null; issuedAt:number; }
export function passwordResetIsUsable(state:PasswordResetState, passwordChangedAt:number, now=Date.now()) {
  return !state.usedAt&&state.expiresAt>now&&state.issuedAt>passwordChangedAt;
}

export function safeResetPath(token:string) { return `/reset-password?token=${encodeURIComponent(token)}`; }
