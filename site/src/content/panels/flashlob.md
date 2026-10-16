## Overview

A research project in progress: a systematic study of context length for limit-order-book transformers, a Hawkes-calibrated attention bias, and a Triton sparse-attention kernel to make long contexts trainable. Code and unit tests are complete; real-data experiments have not run yet, so there are no results.

## Problem

- Does long order-book history carry more predictive signal for volatility than the short windows usually used?
- If so, is that signal concentrated on high-impact events that Hawkes microstructure theory can predict?
- Dense attention memory grows quadratically with context, which limits how long a history fits on a GPU.

## Approach

Order-book messages become event tokens with a time-aware rotary embedding. Attention scores get a bias from a fitted multivariate exponential Hawkes process per event-type pair, and a Triton kernel computes only a structured sparse set of blocks. The work runs as gated phases, each with a pass condition before the next starts.

## Map

(approved FlashLOB figure, interactive)

## Plan and gates

| Phase | What | Gate |
|---|---|---|
| −1 Pilot | Dense transformer, context 100 to 2048, 1 stock, 1 seed, 5 epochs | No-go pivots to an empirical-only study |
| 0 Context sweep | Context 100 to 4096 × 3 seeds | Volatility MAE improves ≥ 3% from 500 to 2048 |
| 1 Hawkes ablation | Dense, sliding, volatility-threshold, Hawkes bias | Hawkes ≥ volatility-threshold by ≥ 0.5% accuracy |
| 2 Kernel | Triton FlashLOB kernel, correctness then VRAM and throughput | Matches the reference at FP16 tolerance |
| Baselines | DeepLOB, TLOB, dense transformer, FlashLOB under one protocol | n/a |

## Status

Code built and unit-tested; real-data runs pending. Nothing here is a finding yet.

## Limits

- No experimental results.

## Links

- Repository: https://github.com/atharvgaur1845/FlashLOB
