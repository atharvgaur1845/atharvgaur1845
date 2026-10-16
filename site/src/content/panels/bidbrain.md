## Overview

A Graph Hacks 2026 project: a construction company's documents in one FalkorDB graph, used by agents to qualify public tenders clause by clause, prove that required documents are missing, settle conflicting documents and cite the page behind every answer. All data is synthetic.

## Problem

- Infrastructure firms win tenders by proving past performance: similar works above a value, qualified personnel, valid bank guarantees, turnover.
- The proof is spread across hundreds of certificates, letters, CVs, ledgers and statements, and those documents contradict each other over time.
- The questions span several hops (person → credential → work → client → portfolio) and some ask for what is absent, which a retriever cannot see.

## Approach

687 PDFs and 9 spreadsheets are extracted into facts and claims, each claim carrying its source, page, issuer and authority. These load into a FalkorDB graph with a 384-d HNSW vector index and a full-text index over 2,564 chunks. Six agents share one registry of 25 graph tools, also served over MCP. A verifier with no LLM re-checks verdicts, and arithmetic happens in the graph, never in the model.

## Map

(approved BidBrain figure, interactive)

## Decisions

| Decision | Alternative | Why | Trade-off |
|---|---|---|---|
| Store contestable values as Claims; Work.value is a view of the winning claim | Overwrite values when documents change | A corrigendum never destroys history; every decision is traceable | More nodes (1,648 claims) |
| Prove absences from the boundary of the set | Vector retrieval | A retriever reasons only over what it fetched, so it cannot see a missing letter | Requires a complete, connected graph |
| One tool registry for agents, MCP server and evaluation oracle | Separate tool code per consumer | The same 25 functions are tested once and used three ways | Tools must stay generic |
| Arithmetic re-reads values from the graph in exact integer rupees | Let the LLM add numbers | Removes arithmetic errors from the model | More tool calls |
| Per-visitor graph copies (GRAPH.COPY), reaped after 24 h | One shared graph | One visitor resolving a conflict never changes what the next sees | Storage per session |

## Evidence

| Claim | Value | Source |
|---|---|---|
| Tool sufficiency | 354 / 354 (21 / 21 on true gold) | README evaluation |
| Conflict engine, JSON stream | P = R = F1 = 1.00 on 275 events | README (rules and labels written by the same team) |
| Conflict engine, PDF path | F1 1.00 after fixing 2 bugs; first run 0.976 | README |
| Q&A accuracy vs vector RAG | not reported; benchmark still running | README |

## Limits

- The corpus is fully synthetic (BITS Hackathon dataset); no real company or person.
- The JSON-path conflict scores mostly check consistency, since the same team wrote the rules and the labels.
- The demo LLM (Qwen3-32B) is hosted via Groq/Cerebras; evaluation runs on vLLM.
- The extraction layer was co-written with Shoyam Mishra for an earlier BITS hackathon; the graph model, agents, conflict engine, MCP, evaluation and UI were built for Graph Hacks.

## Links

- Repository: https://github.com/atharvgaur1845/bidbrain
