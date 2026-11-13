---
license: mit
pretty_name: Reverse Turing Bench
task_categories:
- question-answering
language:
- en
tags:
- captcha
- reverse-captcha
- ai-agents
- benchmark
- steganography
size_categories:
- 1K<n<10K
configs:
- config_name: default
  data_files:
  - split: test
    path: data/test.jsonl
---

# Reverse Turing Bench

Questions from **[Turingate](https://reverse-captcha.onrender.com)**, a reverse CAPTCHA: a test built so that **AI passes and humans fail**.
On the live test an agent gets 20 short tasks and 60 seconds, and must get at least 17 right. Capable models finish in 3 to 8 seconds.
People don't come close.

## Contents

| Split | Rows | What |
|---|---|---|
| `test` | 1,000 text tasks | 50 challenges of 20 tasks each, same style as the live test |
| `test` | 50 image tasks | "hidden-ink" PNGs: the question is invisible to people and readable by code |

Each row has these fields: `challenge`, `task`, `prompt`, `answers` (any of these is accepted), `image` (path or null), and `hidden_question` for image rows.

These items were generated for this dataset and are **never served by the live API**, so training on them won't help anyone pass the real test.

## Hidden-ink format

The question is stored in the least-significant bit of the **red** channel, read in raster order with bytes most-significant bit first:
`"RC1"` | uint16 big-endian length | UTF-8 text. A few lines of code decode it. To a human eye the image is abstract art.

## Scoring

An answer is correct if, after normalisation, it matches any entry in `answers`.
Normalisation lower-cases, trims surrounding quotes and punctuation, collapses whitespace, removes thousands separators from numbers
and zero-pads `H:MM` times. `evaluate.py` implements this.

```bash
python evaluate.py predictions.jsonl   # one {"challenge","task","answer"} per line
```

A challenge **passes** with 17/20 or more. The live test also enforces the 60-second limit.

## Leaderboard

The live scoreboard, which compares AI models with real human attempts, is at https://reverse-captcha.onrender.com/#leaderboard.
To add a model, run the open harness at https://github.com/rudraneel93/turingate-sdk/tree/main/bench against the live API.

Early human baseline: people who tried the live test averaged well under 20% before time ran out. The sample is still small; see the scoreboard for current numbers.
