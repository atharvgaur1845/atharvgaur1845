# lab notebook

Newest entry first. Heading format — date · title · #tags.
Tags: #experiment #reading #idea #failure #infra
Entries tagged #failure also feed the failure log automatically.

## 2026-07-21 · rollout instrumentation for multi-temporal JEPA #experiment

Wired divergence logging into the training loop so latent prediction error is
tracked per horizon step, per band, at every checkpoint — not computed after
the fact. If the hypothesis is that collapse announces itself early, the
instrument has to be running from step zero.

## 2026-07-11 · predictor capacity is not free #experiment #failure

Doubling predictor depth looked like a clean win on one-step prediction and
quietly wrecked long-horizon rollouts — the predictor started memorizing
trajectory quirks instead of dynamics. Lesson recorded: evaluate at the
horizon you care about, never at the horizon that is cheap.

## 2026-07-02 · why JEPA over masked autoencoding, in one paragraph #reading

Reconstruction objectives spend capacity on exactly the pixels I don't care
about (clouds, sensor noise); predicting in latent space lets the encoder
discard them. The open question I keep circling: without reconstruction,
what stops the latent from discarding too much? That question is the project.
