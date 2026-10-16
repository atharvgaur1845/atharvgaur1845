## Overview

A 2D roguelite arena that infers how the player is playing and reshapes physics, visuals and music from that inferred state, with no scripted difficulty levels. It runs in the browser, and a hierarchical reinforcement-learning agent can play it in any of the five play styles on command. Ideated with Shoyam Mishra; the RL agent is Atharv's.

## Problem

- Games usually adapt through fixed difficulty levels or scripted modes.
- The goal: infer the player's current state continuously from how they move and act, and let that state drive the world directly.

## Approach

Five features per frame (speed, keypress rate, heading variance, threat, idle time) feed a non-causal attention model over a 32-frame window: 16 past frames and 16 frames projected by the game's physics. It outputs π, a mixture over five archetypes (arousal, tactical, overload, flow, apathy). A matrix maps π to physics (E = M · π), a small network maps it to shader latents, and π crossfades five musical identities.

## Map

(approved Flow figure, interactive)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| A soft mixture π over archetypes | One discrete label | The world can blend styles smoothly | Harder to explain than modes |
| Non-causal window with physics-projected future frames | Past frames only | Reads where a movement is heading | Depends on the physics projection |
| Hand-tuned M for π → physics | Learned mapping | Predictable, designable behaviour | Manual tuning |
| Music scale switches only after an archetype holds ~1.2 s | Switch instantly | Otherwise the melody rewrites itself several times a second | Slight lag |
| Browser build uses weights dumped from PyTorch | Reimplement and retrain | Same π as the desktop game | Weights must be re-exported on change |

## Evidence

| Claim | Value | Source |
|---|---|---|
| Browser vs desktop inference | largest difference in π: 1.4e-7 | README port check |
| RL agent | meta-policy (16-d, every 200 steps) over low-level policy (119-d, every step), hand-written PPO | README |

## Links

- Play in the browser: https://atharvgaur1845.github.io/flow_game/
- Repository: https://github.com/atharvgaur1845/flow_game
