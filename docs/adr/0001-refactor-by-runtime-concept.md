# Refactor UI by runtime concept and invariant

The dAVEBOx UI should be split into deep modules named after runtime concepts, not by line count or generic helper categories. We will prefer seams such as **Tick Pipeline**, **Track / Clip Sync**, **Pad Surface**, **Drum Lane Workflow**, **Drum Repeat Workflow**, and **Parameter Bank** because they hide ordering, DSP mirror, coalescing, and host-capability invariants behind explicit interfaces.

This means `ui.js` may remain large while a concept is still entangled, and a new module should only be introduced when the deletion test holds: deleting it would push load-bearing rules back into multiple callers. Shallow pass-through modules are not an improvement, even if they reduce file length.
