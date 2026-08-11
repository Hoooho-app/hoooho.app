# LocalFactProvider Baseline Report

This report is generated from the P0 parser evaluation dataset. It measures the current implementation without changing parser behavior.

## Baseline

- Dataset: parser-p0-v1
- Provider: local-fact-extractor
- Parser version: 1.1.0
- Prompt version: health-facts-v2-status-change
- Total cases: 30
- Passed: 16
- Failed: 14
- Case pass rate: 53.3%

## Capability Metrics

| Capability | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| Health fact validity | 25 | 30 | 83.3% |
| Expected fact matching | 30 | 48 | 62.5% |
| Temperature | 2 | 3 | 66.7% |
| Time | 9 | 17 | 52.9% |
| Forbidden fact avoidance | 15 | 15 | 100.0% |

## Results By Category

| Category | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| time | 7 | 10 | 70.0% |
| symptom_status | 5 | 10 | 50.0% |
| negation_complex | 4 | 10 | 40.0% |

## Results By Difficulty

| Difficulty | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| easy | 9 | 10 | 90.0% |
| hard | 1 | 8 | 12.5% |
| medium | 6 | 12 | 50.0% |

## Failure Category Frequency

Failure categories are dataset annotations. A failed case can contribute to more than one category.

| Failure category | Failed cases |
| --- | ---: |
| status_change_missing | 7 |
| entity_missing | 5 |
| time_error | 5 |
| negation_error | 4 |
| body_part_error | 3 |
| relation_error | 3 |
| medication_missing | 1 |
| temperature_error | 1 |

## Failed Cases

### time-002

- Category: time
- Difficulty: hard
- Failure categories: time_error, entity_missing
- Reasons:
  - hasHealthFacts expected=true actual=false
  - missing: visit name~手术 time.raw=三年前

### time-004

- Category: time
- Difficulty: hard
- Failure categories: time_error, medication_missing
- Reasons:
  - hasHealthFacts expected=true actual=false
  - missing: medication name~药 time.raw=前几个月

### time-010

- Category: time
- Difficulty: hard
- Failure categories: time_error
- Reasons:
  - missing: symptom name=皮肤红肿 time.raw=8月初

### status-001

- Category: symptom_status
- Difficulty: hard
- Failure categories: status_change_missing, time_error
- Reasons:
  - missing: status_change change=improved target=发热
  - missing: status_change change=recurred target=发热

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

### status-006

- Category: symptom_status
- Difficulty: hard
- Failure categories: status_change_missing
- Reasons:
  - missing: status_change change=recurred target=发热 time.raw=晚上

### status-009

- Category: symptom_status
- Difficulty: easy
- Failure categories: entity_missing
- Reasons:
  - missing: symptom name=瘙痒

### complex-002

- Category: negation_complex
- Difficulty: medium
- Failure categories: negation_error, entity_missing, body_part_error
- Reasons:
  - hasHealthFacts expected=true actual=false
  - missing: symptom name=瘙痒 bodyPart=喉咙

### complex-004

- Category: negation_complex
- Difficulty: hard
- Failure categories: negation_error, entity_missing, body_part_error
- Reasons:
  - hasHealthFacts expected=true actual=false
  - missing: symptom name=腹胀 bodyPart=肚脐周围

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
  - hasHealthFacts expected=true actual=false
  - missing: symptom name=头晕 bodyPart=头

### complex-008

- Category: negation_complex
- Difficulty: medium
- Failure categories: status_change_missing, temperature_error
- Reasons:
  - missing: temperature temperature=39-39
  - missing: status_change change=improved target=发热

### complex-009

- Category: negation_complex
- Difficulty: hard
- Failure categories: time_error, status_change_missing, negation_error
- Reasons:
  - missing: symptom name=咳嗽 time.raw=前两天
  - missing: status_change change=improved target=咳嗽
