# Reverse Engineering Analysis Report: <Target Name>

## 1. Target and Authorization

- **Target**: <filename / version / architecture, e.g. libfoo.so v1.2 arm64>
- **Hash**: <sha256>
- **Authorization Source**: <CTF / owned system / authorized penetration-test ID / educational research>
- **Analysis Scope**: <specific functionality to recover, e.g. "generation algorithm for the X-Sign signature parameter">

## 2. Black-Box Observation

### I/O Surface
- Input: <source and format>
- Output: <destination and format>

### Behavioral Characteristics (Hypotheses Derived from Differentiated Samples)
| Probe Input | Observed Output Behavior | Inference |
|---|---|---|
| <e.g. all-zero × 16> | <periodicity / length / avalanche behavior> | <e.g. 16-byte block size, block cipher> |

### Oracle Corpus
- Vector file: `oracle.json` (<N> entries)
- Coverage: empty / single-byte / cross-block / very long / all-zero / all-FF

## 3. Target Localization

- Handoff Technique: <constant fingerprinting / API breakpoint backtrace / data-flow backtracking>
- Identified Functions:

  | Symbol / Offset | Inferred Responsibility |
  |---|---|
  | <sub_1234 / +0x1234> | <core transformation> |

## 4. White-Box Recovery

### Algorithm Identification
- Structure: <standard algorithm name or "custom">
- Modified Parameters: <initial values / S-box / round count / constants / byte order>

### Pseudocode
```text
<recovered readable pseudocode>
```

## 5. Reimplementation

- Language/File: <my_reimpl.py>
- Key Implementation Details: <endianness, loop boundaries, final transformation, and other error-prone details>

```python
<core reimplementation code>
```

## 6. Validation Results

- Command: `verify_reimpl.py --reimpl '<...>' --oracle oracle.json`
- Result: **<N>/<N> vectors matched (100%)** ✅ / or list remaining MISMATCH cases and their causes
- Remaining Risks / Uncovered Branches: <if any>

## 7. Delivery Format

- <interoperable client/SDK path and usage example> or <this report itself is the deliverable>
