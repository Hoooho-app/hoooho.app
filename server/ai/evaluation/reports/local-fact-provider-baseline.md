# LocalFactProvider Baseline Report

This report is generated from the P0 parser evaluation dataset. It measures the current implementation without changing parser behavior.

## Baseline

- Dataset: parser-p0-v1
- Provider: local-fact-extractor
- Parser version: 2.0.0
- Prompt version: health-facts-v3-context-and-provenance
- Total cases: 30
- Passed: 24
- Failed: 6
- Case pass rate: 80.0%

## Capability Metrics

| Capability | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| Health fact validity | 29 | 30 | 96.7% |
| Expected fact matching | 41 | 48 | 85.4% |
| Temperature | 3 | 3 | 100.0% |
| Time | 12 | 17 | 70.6% |
| Forbidden fact avoidance | 14 | 15 | 93.3% |

## Results By Category

| Category | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| time | 9 | 10 | 90.0% |
| symptom_status | 8 | 10 | 80.0% |
| negation_complex | 7 | 10 | 70.0% |

## Results By Difficulty

| Difficulty | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| easy | 10 | 10 | 100.0% |
| hard | 6 | 8 | 75.0% |
| medium | 8 | 12 | 66.7% |

## Failure Category Frequency

Failure categories are dataset annotations. A failed case can contribute to more than one category.

| Failure category | Failed cases |
| --- | ---: |
| status_change_missing | 4 |
| relation_error | 3 |
| entity_missing | 2 |
| negation_error | 2 |
| time_error | 2 |
| body_part_error | 1 |

## Failed Cases

### time-002

- Category: time
- Difficulty: hard
- Failure categories: time_error, entity_missing
- Reasons:
  - missing: visit name~手术 time.raw=三年前

### status-004

- Category: symptom_status
- Difficulty: medium
- Failure categories: status_change_missing, relation_error
- Reasons:
  - missing: status_change change=improved target=头痛 time.raw=今天

### status-005

- Category: symptom_status
- Difficulty: medium
- Failure categories: status_change_missing, relation_error
- Reasons:
  - missing: symptom name=手脚发凉 time.raw=昨晚
  - missing: status_change change=improved target=手脚发凉 time.raw=今天早上

### complex-006

- Category: negation_complex
- Difficulty: medium
- Failure categories: status_change_missing, relation_error
- Reasons:
  - missing: status_change change=persistent target=咳嗽

### complex-007

- Category: negation_complex
- Difficulty: medium
- Failure categories: negation_error, entity_missing, body_part_error
- Reasons:
  - forbidden: symptom name=疼痛

### complex-009

- Category: negation_complex
- Difficulty: hard
- Failure categories: time_error, status_change_missing, negation_error
- Reasons:
  - hasHealthFacts expected=true actual=false
  - missing: symptom name=咳嗽 time.raw=前两天
  - missing: status_change change=improved target=咳嗽
