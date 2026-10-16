## Overview

A workshop paper accepted to the 2nd Workshop on Advances in Representation Learning for Earth Observation (REO) at NeurIPS 2026. It adds two trivial baselines to a comparison of self-supervised objectives on satellite imagery and shows that the baseline, and the margin over it, both move with the capacity of the probe used to evaluate them.

## Problem

- Self-supervised objectives for satellite imagery are usually compared with each other, almost never with a trivial floor.
- Without a floor, a method can look useful while encoding little that the raw input does not already carry.
- The question: how much do these objectives add over a baseline with no parameters, and does the answer depend on how they are read out?

## Approach

Five objectives (temporal JEPA, spatial JEPA, MAE, BYOL, SimCLR) pretrain the same encoder on PASTIS Sentinel-2 series for 100 epochs. Two floors are added: patch-mean raw spectral bands (zero parameters, 10 channels) and the same architecture with random weights. Encoders are frozen and read by probe heads whose spatial receptive field is swept over 1, 3, 5 and 9. Epochs, per-step batch, effective batch and probe budget are matched; compute is not.

## Map

(approved REO2 figure, interactive)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| Add a zero-parameter raw-band floor and a random-init floor | Compare objectives only with each other | A floor shows what an encoder adds over its input | Two more cells per probe |
| Sweep probe receptive field 1, 3, 5, 9 | Report one probe | The floor rose 4.76 → 21.45 mIoU across the sweep, so one probe hides the dependence | Fixed 15-epoch probe budget: capacity and ease of optimisation are not separated |
| Report margins in units of across-seed sd, n = 3 | p-values | At n = 3 no rank test is informative | Wide uncertainty bands |
| Pre-register the decision rule before running the floors | Decide after seeing results | Fixes the claim in advance | The rule itself fixed one probe capacity, the choice the paper is about |
| Match per-step batch, not only effective batch | Match effective batch only | SimCLR negatives and the variance-covariance term are computed per micro-batch | Compute differs: 6.24 vs 0.55 GPU-hours per seed (temporal JEPA vs MAE) |

## Evidence

| Claim | Value | Source |
|---|---|---|
| Raw-band floor across RF 1 → 9 | 4.76 → 21.45 mIoU | Paper |
| Temporal JEPA margin over the floor | +10.56, +4.78, −0.15, −1.57 (RF 1, 3, 5, 9; n = 3) | Paper |
| At RF 3 | 19.26 ± 1.30 vs floor 14.47 ± 0.01 | Paper, Table 1 |
| Shuffled-time control | keeps about 70% of the conv margin (seed 0) | Paper, Appendix |
| Without the anti-collapse penalty | effective rank 312.4 → 1.49 of 512; conv mIoU 20.03 → 8.68 (seed 0) | Paper, Appendix |
| Status | Accepted, camera-ready forthcoming | Atharv |

## Limits

- n = 3 seeds (SimCLR and BYOL n = 2); the collapse ablation and shuffled-time control are single-seed.
- Frozen probes on one dataset, series truncated to 32 acquisitions, no fine-tuning.
- No reversal is claimed at RF 9: the margin there is 1.2 sd.

## Links

- Code (paper branch): https://github.com/atharvgaur1845/multi_temporal_jepa/tree/reo2-probe-capacity/REO-2
