# Projection calibration

The first display policy was calibrated for a 360 × 640 point phone canvas. The usable map rectangle excludes 16-point side margins, a 74-point header/control zone, and an 80-point bottom Capture/control zone.

Measured compact presentation footprints:

| Presentation | Marker bounds | Interaction/separation slot | Notes |
| --- | ---: | ---: | --- |
| Status pin pill | 62 × 36 | 82 × 60 | Medium origin marker |
| Goal flag | 50 × 50 | 74 × 68 | Largest planned point |
| Task arrow | 52 × 36 | 76 × 60 | Medium executable point |
| Summary pill | 68 × 24 | 88 × 44 | Tappable contracted route |
| Record count | 26 × 26 | 44 × 44 | Minimum target size |
| Record note | 36 × 30 | 44 × 44 | Evidence-lane item |

Worst-case labels are capped at 150 × 22 points and downgrade independently from their marker. Controls are excluded from the usable rectangle rather than counted as map ink.

The initial policy limits marker ink to 18%, label ink to 14%, line ink to 9%, and Record ink to 9% of usable area. These values kept type silhouettes distinct, labels separate, and routes traceable across the sparse, wide Health/Work, dense terminal, deep refinement, and Record-focused fixtures. Emergency guards of 28 markers, 48 connections, and 8 individual Records protect rendering; they are not selection targets.

The development overlay reports semantic band, relative zoom, selected points/routes, and marker coverage. `simulateProjection` exposes the full diagnostics model to fixture tests and further tuning tools.
