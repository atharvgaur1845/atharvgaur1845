## Overview

Team Short Circuits from BITS Pilani reached the finals of the LAM Research Challenge 2025, as one of 24 finalists from about 8,000 registrations. The team built an arena system in simulation, then on real hardware, then adapted it to surprise tasks in the finals.

## Problem

- Round 1: build the whole arena in CoppeliaSim, including line following, gate-based IR detection and conditional actuation of a pump and an LED display.
- Round 2: build it physically from Lam Research and T-Works kits and make it work under real alignment, latency, sensing noise and power constraints.
- Finals: add surprise elements under tight timelines.

## Approach

Every action is triggered by a sensor event. IR line sensors steer a mecanum base; an IR gate event actuates a peristaltic pump and displays; ultrasonic sensing halts the robot before obstacles. The same gate logic later drove the finals' surprise elements.

## Map

(approved LAM figure, interactive)

## What was built

- 4-axis robotic arm with gripper
- 4-wheel mecanum drive base
- Line follower with IR sensors
- Ultrasonic obstacle detection and halt logic
- Peristaltic pump control and actuation
- Gate-triggered logic integrated with displays and peripherals
- Finals: dual liquid cooling and transportation systems controlled via gate sensors; hologram control through gate logic

## Evidence

| Claim | Value | Source |
|---|---|---|
| Result | Finalist, 24 of about 8,000 registrations | Atharv |
| Team | Team Short Circuits, BITS Pilani, 4 members | Atharv |

## Limits

- This was a team build; work was shared across all four members.
- The control-logic figure summarises the team's logic; there is no public repository.

## Thanks

Parth Satra, Parth Modasia and Rebant Rana.
