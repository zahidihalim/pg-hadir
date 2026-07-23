# NEXT SESSION PLAN

Start after: Owner completes UAT and reports results.

---

## Priority 1 — Owner UAT

- [ ] 1. Run full TEST checklist (47 tests from `docs/TESTING.md`)
- [ ] 2. Record pass/fail for each test
- [ ] 3. Capture screenshots of public page, Admin page, PDF output
- [ ] 4. Record any defects with exact steps to reproduce
- [ ] 5. Do not request new features during UAT unless blocking

## Priority 2 — Defect Resolution

- [ ] 6. Fix only confirmed defects in `event-update/new-event`
- [ ] 7. Retest affected function (browser verification)
- [ ] 8. Run regression tests on unchanged functionality
- [ ] 9. Update documentation with defect resolution notes
- [ ] 10. Commit small targeted fixes

## Priority 3 — Release Review

- [ ] 11. Review full branch diff against main
- [ ] 12. Run secret scan (no credentials, Sheet IDs, API keys exposed)
- [ ] 13. Confirm no TEST-only diagnostic logs remain
- [ ] 14. Confirm TEST GAS URL strategy (swap to production before release?)
- [ ] 15. Confirm Cloudflare production branch is set to `main`
- [ ] 16. Confirm rollback plan: production files + GAS revert path
- [ ] 17. Prepare Pull Request with UAT results summary
- [ ] 18. CTO review
- [ ] 19. Owner approval

## Priority 4 — Release

- [ ] 20. Merge `event-update/new-event` into `main`
- [ ] 21. Deploy Cloudflare Pages from `main` branch
- [ ] 22. Purge Cloudflare cache
- [ ] 23. Run production smoke tests (public page loads, search works, login works)
- [ ] 24. Verify public page renders with SuperAdmin settings
- [ ] 25. Verify Admin dashboard with real participant data
- [ ] 26. Verify participant search returns real results
- [ ] 27. Verify attendance confirmation records correctly
- [ ] 28. Verify PDF generation with dynamic title/venue
- [ ] 29. Verify WhatsApp invites use dynamic link and message
- [ ] 30. Monitor after release (check logs, user reports)

## Priority 5 — Future Work (Deferred)

- [ ] 31. Photo integration — gallery linked to new event photos
- [ ] 32. Multi-event support — archive/reuse settings per event
- [ ] 33. Role-based admin — read-only vs full-access roles
- [ ] 34. Audit logs — record who changed what and when
- [ ] 35. Rate limiting — protect public endpoints from abuse
- [ ] 36. Security hardening — additional token checks, CSP headers
- [ ] 37. Automated testing — browser test suite for UAT automation
- [ ] 38. Dark mode support
- [ ] 39. Offline caching (Service Worker)
