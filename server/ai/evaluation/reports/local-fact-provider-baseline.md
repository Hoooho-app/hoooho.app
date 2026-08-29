# LocalFactProvider Baseline Report

This report is generated from the P0 parser evaluation dataset. It measures the current implementation without changing parser behavior.

## Baseline

- Dataset: parser-p0-v1
- Provider: local-fact-extractor
- Parser version: 2.0.0
- Prompt version: health-facts-v3-context-and-provenance
- Total cases: 30
- Passed: 25
- Failed: 5
- Case pass rate: 83.3%

## Capability Metrics

| Capability | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| Health fact validity | 30 | 30 | 100.0% |
| Expected fact matching | 42 | 48 | 87.5% |
| Temperature | 3 | 3 | 100.0% |
| Time | 13 | 17 | 76.5% |
| Forbidden fact avoidance | 15 | 15 | 100.0% |

## Results By Category

| Category | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| time | 9 | 10 | 90.0% |
| symptom_status | 8 | 10 | 80.0% |
| negation_complex | 8 | 10 | 80.0% |

## Results By Difficulty

| Difficulty | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| easy | 10 | 10 | 100.0% |
| hard | 6 | 8 | 75.0% |
| medium | 9 | 12 | 75.0% |

## Failure Category Frequency

Failure categories are dataset annotations. A failed case can contribute to more than one category.

| Failure category | Failed cases |
| --- | ---: |
| status_change_missing | 4 |
| relation_error | 3 |
| time_error | 2 |
| entity_missing | 1 |
| negation_error | 1 |

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

### complex-009

- Category: negation_complex
- Difficulty: hard
- Failure categories: time_error, status_change_missing, negation_error
- Reasons:
  - missing: status_change change=improved target=咳嗽
