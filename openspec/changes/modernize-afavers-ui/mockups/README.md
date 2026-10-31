# Interactive design references

These are illustrative, interactive Visualize fragments, not production app code. They contain local sample data and never contact the live Afavers backend or send email. The interface font can load from an approved static font origin; production font delivery is separately specified as self-hosted.

## Files

- `desktop.html`: complete desktop workspace with Workbench and Focus layout alternatives.
- `phone.html`: contained phone workspace, with dedicated details and stage-focused application management.

The canonical conversation fragments are kept in:

`C:/Users/Nah.STEVEN/.codex/visualizations/2026/10/27/01a17ca0-708b-7502-88a2-e933cab4cece/afavers-workspace.html`

`C:/Users/Nah.STEVEN/.codex/visualizations/2026/10/27/01a17ca0-708b-7502-88a2-e933cab4cece/afavers-phone.html`

The repository copies are synchronized with those fragments for future implementation reference. They use the Visualize host's Lucide, variant carousel and optional Tweak helper. They are HTML fragments, intentionally without a document wrapper. Do not place them directly in the production route tree.

## Typography and motion revision

The current revision uses DM Sans for interface/body text and Manrope for headings. Manrope is the selected free alternative after the owner requested an Object Sans-like free family. Preserve the existing wordmark. DM Sans and Manrope have OFL license references in design.md; production uses self-hosted assets, while these conversation previews can load approved static font resources.

Decorative company-initial tiles and coaching taglines have been removed. Detail selection uses a 180ms lateral settle; save feedback a 120ms compression/return; moving an application uses measured 180ms FLIP when both positions are available. No generic fades or looping animation. Reduced motion is instantaneous, and editing/filtering/background rerenders do not replay entrance motion.

The owner explicitly requested finalizing mockups and specifications first. This revision does not start the production implementation.

## Review flows

1. Compare Workbench's simultaneous list/inspector with Focus's list-to-detail path.
2. Search, filter for remote, choose a saved search, save a named search and select a vacancy.
3. Save a job, inspect match reasoning, open Preparation, edit a draft and inspect Activity.
4. Hide then undo hiding; activate Apply to see the explicit preview boundary.
5. Open Overview, Applications, Reminders, Analytics or Settings from the shell.
6. On phone, open a vacancy and return, change application stage, and open secondary navigation with More.
7. Use optional design controls to adjust density/corners, show result reasons or stress-test a long German title.

## Evidence and limitations

See `../preview-validation.json` for the exact checks. Syntax and offline DOM interactions are distinct from browser-rendered layout, actual host integrations, screen-reader use and physical-phone acceptance. The browser's local-file restriction was respected; no alternate protocol or browser workaround was used.

No production behavior is approved by these fragments. Use the normative specs, coverage matrix and later exact-candidate tests during implementation.
