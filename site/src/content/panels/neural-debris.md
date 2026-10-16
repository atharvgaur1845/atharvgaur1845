## Overview

A competition entry for Neural Debris Removal in Streak Detection Models. A satellite-streak detector was trained on poisoned data. The pipeline keeps the supplied RetinaNet fixed and learns a second-stage classifier that decides, per detection, whether a poisoning artifact caused it.

## Problem

- The supplied detector responds to injected artifacts: single-pixel hot chains, beaded lines, short dashes and comet-like streaks.
- The metric (maCADD) compares the submission against a hidden clean model's output.
- Fine-tuning changes the confidence and geometry of every detection, so even a model that unlearns the poison loses points on the genuine ones.

## Approach

Reproduce the supplied detector's outputs, extract a 1,039-dimensional vector per detection from hooked FPN and class-tower activations plus 14 pixel-morphology measures and the confidence, and train a poison-versus-clean probe on the annotated unlearning images with dihedral augmentation, synthetic clean streaks and synthetic poison. Then keep, soften, drop or demote each detection by its poison probability.

## Map

(approved NeuralDebris figure, interactive)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| Triage detections with a second-stage probe | Fine-tune the detector | The detector's genuine outputs stay identical to the supplied model's | Cannot remove artifacts the detector never boxed |
| Features from the frozen detector's own activations | Train a separate image classifier | The probe sees what the detector saw at each box | Tied to this detector |
| Synthetic clean and poisoned streaks | Annotated data only | More training signal for a small labelled set | Synthetic artifacts may not match real ones |
| Soften as well as drop | Binary keep/drop | Hedges uncertain cases under the metric | One more threshold |

## Limits

- No final score or placement is recorded in the repository.
- Some later experiments depend on cached artifacts from code not in the repository; those are identified in the README.

## Links

- Repository: https://github.com/atharvgaur1845/NeuralDebrisRemovalinStreakDetectionModels
