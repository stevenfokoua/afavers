## verdict

1. Resolved — desktop/phone section captures say “Example vacancies” and “Illustrative examples · not live vacancies”; the dialog names an example vacancy and offers a job-search destination, while source replaces sample "#" links with registration.
2. Partial — 768px/1024px captures show the collapsed rail and expanded readable navigation, but jobs-320.png visibly retains root horizontal scrolling; the measured clientWidth 305 versus scrollWidth/body width 320 confirms 15px overflow from body min-width:320px.
3. Resolved — dashboard captures show job/quick-action rows and one consolidated Upcoming agenda; source retains all eleven visibility keys and order controls, and routes agenda actions through each selected row's job ID.
4. Partial — sample/extension captures visibly remove the two eyebrows and source removes the decorative category numbering; the category strip itself is below the supplied hero frames, so its visual correction still needs a settled section capture.
5. Resolved with reviewed exception WIDE-INSPECTOR-01 — phone initial Jobs JS grows 9,507 gzip bytes, passing the 10,240-byte cap; wide grows 22,058 and numerically fails it by 11,818. Accept the exception only for this automatic wide Jobs inspector: its additional 12,551-byte closure contains the shared editor and DOMPurify, is deferred on phone, and reuses a supplied row. The receipt records unchanged original services, zero new production services and 62,692 font bytes; wideBudgetPass remains false.
6. Resolved — fresh typecheck/build exit 0 and current public-route captures render after the copy fix; the corrected client-directory focused lint exits 0. Preserve the earlier wrong-directory lint failure, the main test worker-startup failure and nonzero overall lint; the reported 96 passed assertions and zero failed assertions across separate phases do not make those failed commands pass.

## remaining

Fix 2: remove the unnecessary body minimum, recapture 320px Jobs and verify documentElement.scrollWidth <= documentElement.clientWidth with a vertical scrollbar present. Fix 4: add a settled category-strip capture showing its removed numbers. No other regressions identified within this six-fix scoring pass. This covers the scored fixes only, with native viewport/named-section evidence; it does not grant whole-surface, whole-document or production acceptance.

disposition: fix
