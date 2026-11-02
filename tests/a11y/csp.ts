import { expect, test as base } from "@playwright/test";

/** One Content Security Policy violation, as the browser reported it to the page. */
export interface CspViolation { page: string; directive: string; blocked: string; disposition: string }

/**
 * Every check runs with a listener for `securitypolicyviolation` in every document the page opens,
 * and ends by asserting the count is 0. The policy is enforced on `next start`, so a script without
 * this request's nonce, or a photo from a host the policy does not name, fails the check that
 * reached it, not only a log line.
 */
export const test = base.extend<{ cspViolations: CspViolation[] }>({
  cspViolations: [async ({ page }, use) => {
    const violations: CspViolation[] = [];
    await page.exposeFunction("__rackedCspViolation", (violation: CspViolation) => { violations.push(violation); });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", event => {
        (window as unknown as { __rackedCspViolation: (violation: object) => void }).__rackedCspViolation({
          page: location.pathname, directive: event.effectiveDirective, blocked: event.blockedURI, disposition: event.disposition,
        });
      });
    });
    await use(violations);
    expect(violations, "Content Security Policy violations").toEqual([]);
  }, { auto: true }],
});

export { expect };
