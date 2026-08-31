# LocalFactProvider Baseline Report

This report is generated from the P0 parser evaluation dataset. It measures the current implementation without changing parser behavior.

## Baseline

- Dataset: parser-p0-v1
- Provider: local-fact-extractor
- Parser version: 3.0.0
- Prompt version: health-facts-v4-subject-state-contract
- Total cases: 30
- Passed: 30
- Failed: 0
- Case pass rate: 100.0%

## Capability Metrics

| Capability | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| Health fact validity | 30 | 30 | 100.0% |
| Expected fact matching | 48 | 48 | 100.0% |
| Temperature | 3 | 3 | 100.0% |
| Time | 17 | 17 | 100.0% |
| Forbidden fact avoidance | 15 | 15 | 100.0% |

## Results By Category

| Category | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| time | 10 | 10 | 100.0% |
| symptom_status | 10 | 10 | 100.0% |
| negation_complex | 10 | 10 | 100.0% |

## Results By Difficulty

| Difficulty | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| easy | 10 | 10 | 100.0% |
| hard | 8 | 8 | 100.0% |
| medium | 12 | 12 | 100.0% |

## Failure Category Frequency

Failure categories are dataset annotations. A failed case can contribute to more than one category.

| Failure category | Failed cases |
| --- | ---: |
| none | 0 |

## Failed Cases

No failed cases.
