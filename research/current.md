focus: temporal JEPA for satellite time-series
status: building — training scaffold up, instrumenting rollouts
since: 2026-06-30
repo: atharvgaur1845/multi_temporal_jepa

## hypothesis

Latent prediction without reconstruction keeps the information that matters
for downstream temporal reasoning — and its failure mode (collapse or
divergence) is measurable long before accuracy metrics notice.

## latest result

Multi-temporal JEPA scaffold trains end-to-end on satellite sequences.
Next measurement: how prediction error in latent space grows with rollout
horizon, per spectral band.

## next

- ablate predictor depth against horizon length
- log latent-divergence curves during training, not just after
- compare EMA target schedules
