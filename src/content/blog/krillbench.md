---
title: "Krillbench"
description: "LLMs work by generating the next most common token, but can they do the opposite?"
pubDate: 2026-10-28
---

The new daily game on the block [Krillion](https://krillion.io/) has taken my friend group by storm. The gist of the game is simple: on a timer, pick the rarest answer you can think of for a trivia question. The problem is, I suck at it. 

I wanted to see if I could find a little helper to let me brag a little about how much of a trivia buff I've become just over the past couple of weeks. I knew I couldn't just send e.g. "What is a fruit that ends in the letter e? Pick the rarest answer," to any model out there and expect the best answer every time, so I created the crudest new frontier AI benchmark (if you can even call it that): Krillbench.

## Methodology

I chose to run this experiment with three of the strongest models I had access to:
1. [Kimi K3.1 Pro](https://www.kimi.ai/blog/kimi-k3-1-pro)
2. [DeepSeek V4.1 Flash 1017](https://huggingface.co/DeepSeek-ai/DeepSeek-V4.1-Flash-1017)
3. [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5)

I also decided to use a local model, one that most people with decent consumer hardware could feasibly run on their own machines: [Bonsai 2 27B](https://prismml.com/news/bonsai-2-27b).

Opencode was used for Kimi, DeepSeek and Bonsai, while Opus ran in Claude Code. Both model harnesses were run with tools and custom settings disabled (like AGENTS.md files, skills, etc.) and a custom system prompt, so the only information they got was whatever I couldn't figure out how to disable. Hopefully, this got rid of any kind of scoring bias due to the harness itself, and removed several potential cheating angles.

I chose the thinking level per model by their performance on a smaller, representative test split. All models tended to plateau in performance around high effort, as they only performed within a margin of error better past it or spent a disproportionate amount of time thinking to where they timed out before giving an answer. Bonsai doesn't have a "high"; just low[^1], medium, and xhigh, so I settled on medium.

I scraped 350 of the game's answer sets, enough for 50 individual games. Some potential valid answers are not listed in these finite banks, so I used the [Parallel Decisions API](https://parallel.ai/blog/decisions-api) to separate real answers that web search can validate from "invented but realistic sounding" ones when a model gave an answer not present in the bank. 

From testing I found it to be cautious by design, and it had to be in order to avoid the models from gaming the system, and that worked out well: the vast majority of invented or off-topic answers (over 90%) were rejected. The ones that slipped through did not seem to greatly affect the overall results. Scores given by the external judge were normalized to the game's point scale. This let me compare banked and judge-accepted answers within the same scoring system.

The models were given almost the same rules as the game: 7 prompts, with up to three tries per prompt, and the first accepted answer is final. 

The initial prompt (written by one of our contestants, Opus):
```
You are playing a trivia word game: 100 rounds of 7 prompts, one prompt at a time.
Each prompt asks you to name something, like "Name a city".

Scoring. An answer is accepted only if it is on the game's list of valid answers for that prompt (small typos are forgiven).
Accepted answers score by how few players give them:
- plankton (most players think of it): 75 points
- schooler: 200
- rare: 300
- deep cut: 400
- one in a krillion (almost nobody gives it): 500

You get up to 3 tries per prompt. A rejected answer costs nothing but a try.
Your first accepted answer is final, so you can't improve on it once it's accepted.
3 rejections score 0.

After each answer you'll see whether it was accepted and what it scored, and after each round your round score and running total.
Your goal is the highest total score over all 50 rounds.

Take as much time to think as you like before you answer.
Your reply itself must be only your answer: no explanation, no quotes, nothing else.
```

Points awarded by tier were similar but slightly different from the real game:
- Plankton: 75
- Schooler: 200
- Rare: 300
- Deep cut: 400
- One in a krillion: 500

Models saw feedback after every answer and a summary after each round. Each model played all 50 rounds in a single conversation, in the same order.

## Results

![Graph of rolling mean of points scored per round per model](https://cdn.bednarczyk.xyz/images/krillbench/report-1-rolling-mean.avif)

All models seemed to not encroach upon each other's territory. As seen in the graph each one was basically in a league of its own, with DeepSeek pulling ahead of the pack. What surprised me here was that Opus, Anthropic's best proprietary model to date, falls behind two open weight models in this "benchmark" by a significant margin.

Another easy to spot anomaly is a clear drop in scores around round 40: this is explained by the questions given around that time. Rounds 41 and 42 were among the hardest for all 4 models:

| Round 41 | Round 42 |
|---|---|
| Name a song with a question in the title | Name an animal that is very big |
| Name an Italian dish | Name a medical test |
| Name a Disney song | Name a lake in Europe |
| Name an owl | Name something people lose |
| Name a type of engineer | Name a road sign |
| Name a job at an airport | Name a famous park |
| Name a famous twin | Name a religion with a holy book |

The worst-scored question out of this group was the one about the holy book: with an average of 194 points versus a typical 341, just under schooler tier. However, the worst overall is something our sentient computer friends should know very well: "name a unit of digital data". That average was only 106 points. Kimi gave the best answer being "pebibyte", scored at schooler tier. 

---

![Bar graph showing the share of answers models gave per tier](https://cdn.bednarczyk.xyz/images/krillbench/report-2-tiers.avif)

This chart explains why DeepSeek pulled ahead so far in the scoring: it reached for answers that hit the deep cut and krillion tiers about 70% of the time. Kimi was the runner up in that regard, and Opus tried to play the game safer. Bonsai was the only model that missed at least 1% of its answers, even when given retries.

When it comes to perfect rounds, none happened. The closest was Kimi, with 6 krillions out of 7 in round 21:

| Prompt | Kimi's answer | Result |
|---|---|---|
| Name a capital city on a river | Mbabane | krillion |
| Name a number-one hit from the 2000s | "Laffy Taffy" | krillion |
| Name something you see in the clouds | A dragon | plankton |
| Name a DC Comics character | Danny the Street | krillion |
| Name a subgenre of rock or metal | Zeuhl | krillion |
| Name an architect | Jože Plečnik | krillion |
| Name a 3D shape | Gyrobifastigium | krillion |

DeepSeek never got more than 4 krillions in a round, but it was the steadiest. It had 3 or 4 in more than half its rounds and only one round with none. The highest single-round score was 3,200, which DeepSeek and Kimi both hit in round 25.

DeepSeek worked out the strategy it would use for the rest of the games before it saw any concrete feedback, and it hardly changed. It noticed a rejected answer costs nothing, so it led with a risky answer and kept safer ones as fallbacks.

> we want to use 3 tries strategically; rejections cost nothing. So dentures first is strategically good if acceptance probability decent.

By round 25, it guessed how answers were graded. It never knew a judge existed, but it guessed at one:
> list is large and includes obscure
> list includes many Wikipedia-ish answers, maybe judged by model?

---

![Bar graph showing average points per prompt and the percentage of answers scored by the Parallel judge per model](https://cdn.bednarczyk.xyz/images/krillbench/report-3-bank-vs-judge.avif)

Its intuition was right. DeepSeek had significantly more answers scored by the judge than any other model, corellating with its krillion/deep cut score share. This chart also strengthens the hypothesis earlier that Opus was trying to play it safe on purpose to guarantee a solid score, as most of its answers were in the banks.

| Model | Entertainment | People & places | Nature & science | Food & everyday | Film & fiction | Open-ended |
|---|--:|--:|--:|--:|--:|--:|
| Opus 5.5 | 335 | 356 | 344 | 322 | 344 | 284 |
| DeepSeek 4.1 Flash | 371 | **397** | **398** | **360** | **414** | **381** |
| Kimi K3.1 Pro | **376** | 387 | 357 | 352 | 399 | 302 |
| Bonsai 2 27B (local) | 251 | 287 | 298 | 262 | 265 | 305 |

Overall, DeepSeek won in 5 of the 6 categories of questions, just slightly losing to Kimi in entertainment.

---

So, can a machine built to predict the most likely next token learn to do the exact opposite? Mostly yes.

I think the biggest finding here is that regardless of knowledge, models differed in how they play. That might be the most interesting thing this experiment measured: whether a model can suppress its first instinct. Fifty games is a small sample, and I admit I don't work for an AI research lab so my experimental methodology could certainly be better, but the results are still interesting to look at.

[^1]: PrismML's own guidance states that low isn't officially supported and will perform near xhigh, which almost always timed out thinking on my machine. I used neither.
