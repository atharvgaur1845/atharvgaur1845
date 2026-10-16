## Overview

A 40-class activity recognition system for the CUHK-X Challenge Small Model Track, built from five sensor specialists and a sequence decoder, shipped as one file of 96.37 MB. It finished 14th of 326 teams on the private leaderboard and was selected for a poster at the CUHK-X Challenge Grand Finals, UbiComp/ISWC 2026, Shanghai.

## Problem

- Recognise 40 everyday activities from privacy-preserving sensors: infrared, depth, thermal, skeleton, five wearable IMUs and radar.
- Training data: 2,933 clips from 18 people. Test: 405 clips from four people never seen in training.
- Every parameter used at inference, detectors included, must fit in one file of at most 100 MB.
- The top 15 move to a Selection Stage where organizers reproduce the result from the package.

## Approach

Five specialists each read the signal they are best placed to read: a person crop and a wrist crop from infrared plus depth, the full thermal frame, a 20-member skeleton and IMU stack, and a tree model on IMU statistics. Their log-probabilities are combined after reconciling the class priors each one was trained with. A decoder then uses the order in which each person recorded the activities to correct labels that do not fit the sequence.

## Map

(full three-panel CUHK-X figure from the approved poster, interactive)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| Resolution per view: 384 px for the person crop, 224 px for wrist and thermal | One resolution for all views | Measured: 224 → 288 → 384 px helped the person view (pooled OOF 0.714 → 0.730 → 0.733) but cost the wrist view 1.36 points | Three resolutions to manage |
| Fuse in log space after dividing the plain-CE stack by the training prior | Average probabilities directly | Members trained with different losses emit posteriors under different priors; fusing in the wrong direction measured 0.587 against 0.627 | Fusion depends on knowing how each member was trained |
| Ordered transition decoder over each subject's clips | Per-clip argmax | Subjects record activities in a scripted order; measured +10.4 pooled OOF and +3 to +5 public clips | Couples predictions within a sequence |
| int5 bit-packed video weights, int8 skeleton stack, fp16 detectors | Uniform int8 | Needed to fit 96.37 MB; int8 detectors moved 150 of 405 crop windows, so detectors stay fp16 | int5 cost one public clip, recovered by the thermal weight soup |
| Ship the 405 test crop windows inside the package | Recompute windows at inference | Recomputing on another GPU matched only 184 of 405 person windows and moved 22 predictions | Unseen clips still use the packaged detectors live |

## Evidence

| Claim | Value | Source |
|---|---|---|
| Final private leaderboard | 14th of 326, 0.87745 | Kaggle, private tab |
| Public leaderboard | 17th of 326, 0.86567 | Kaggle API |
| Grand Finals poster | UbiComp/ISWC 2026, Shanghai, 12 Oct 2026 | Organizer email |
| Package size | 96,369,921 bytes | Reproduction package |
| Reproduction | 0 differing rows on two machines; 2 min 39 s on an A100 | EXP-159 |
| Cross-subject spread | ensemble LOSO mean 0.782 (sd 0.054) vs best single view 0.726 (sd 0.069) | EXP-145 |

## Limits

- Eight teams scored above 0.90 on the public board. An oracle that picks the right member per clip reaches 0.877 OOF, so the remaining error is in choosing between members under subject shift, not in what the members know.
- The public split is four subjects; one public score carries about ±6.9 clips of sampling noise.
- The skeleton stack's original build command predates the project's logging; its weights ship verbatim.

## Links

- Repository: https://github.com/atharvgaur1845/CUHK-X-CompetitionSmallModelTrack
