## Overview

A pipeline that decides whether a proposed character backstory is consistent with a long novel. It pretrains a Baby Dragon Hatchling (BDH) language model on the novels, uses it for retrieval and classification, and includes probes that save per-layer attention maps.

## Problem

- The evidence for or against a backstory is scattered across a whole novel, far beyond one context window.
- The classifier has to judge consistency, not just keyword overlap or name matches.

## Approach

Novels are cut into 400-token windows with 100-token overlap, filtered to chunks mentioning the character, and scored by 0.6 × BM25 + 0.4 × dense similarity from the pretrained BDH model. The top three chunks join the character and backstory as one input. The BDH body is fine-tuned BitFit-style (layer norms and biases only) with a classifier head; negatives come from swapping character names inside true backstories.

## Map

(approved BDH figure, interactive; the attention panel is a schematic)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| Hybrid retrieval, 0.6 BM25 + 0.4 dense | One retriever | Lexical matches and semantic similarity catch different evidence | Two indexes |
| Drop the character's name tokens from retrieval keywords | Keep them | Retrieval keys on content, not on the name appearing | Can miss name-specific facts |
| BitFit-style fine-tuning | Full fine-tuning | Few trainable parameters on a small labelled set | Less capacity to adapt |
| Name-swap negatives, balanced | Natural negatives only | Forces the model to check facts against the character | Synthetic negatives may be easier than real ones |

## Limits

- No final score is recorded in the repository.
- An experimental dendritic branch exists (active dendrites, dendritic norm, R-Drop, SWA) and is not the main pipeline.

## Links

- Repository: https://github.com/atharvgaur1845/BDH_based_system_for_long-form_narrative_consistency_evaluation
