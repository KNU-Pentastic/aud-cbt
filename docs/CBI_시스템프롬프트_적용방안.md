# CBI 카탈로그 → 시스템 프롬프트 적용 방안

> 상태: **1차 구현 완료 (임상 검토 대기)** · 작성일 2026-05-24 · 기준 카탈로그 v3 (검수완료 518건)
>
> **구현 현황 (2026-05-24)** — 단순화안(12주 + Phase 3 분류기) 1차 구현:
> - `backend/scripts/build_cbi_prompts.py` — xlsx→`app/prompts/cbi/v3/_source/*.json` 추출·필터.
> - `backend/app/prompts/cbi/v3/*.json` — 큐레이션 한국어 자산 17종 + `modules.json` (모두 `reviewed:false`, 임상 검토 대기). **원문에 가깝게(near-1:1) 정제**: 원문(필터후) 400개 → 원칙 331개. vignette/인용·Form/행정·페이지 파편만 제외하고 고유 임상 지시문은 거의 1:1로 보존(phase_1 79→55, dref 50→41, mood 36→32 등).
> - `backend/app/services/prompt_assets.py` — 자산 로더/렌더러.
> - `backend/app/services/module_classifier.py` — Phase 3 모듈 선택기(Haiku, ≤2, 휴리스틱 폴백, 세션 캐시).
> - `backend/app/services/context_builder.py` — 주차→Phase 결정 + Phase 3 분류기 + 자산 조립(주차 고정표 폐기).
> - `backend/app/services/output_filter.py` — OUTPUT_GUARD(mi_style) 사후 점검 추가.
> - 스키마/명세 동기화: `internal.py`·`openapi.yaml`에 `module_classification`/`module_classifier`/`mi_style` enum 추가.
> - 검증: py_compile·자산 JSON·렌더·enum 통과. DB/앱 통합 실행은 로컬에 backend 의존성 미설치로 미실행(docker compose 필요).
> 원전: NIAAA Combined Behavioral Intervention Manual (COMBINE Monograph Vol.1, 2004)
> 참고 문서: `docs/CBI_분류기준_v3 (2).docx`, `docs/CBI_검증_재분류_정제_검수완료 (2).xlsx`

## 0. 한 줄 요약

CBI 카탈로그의 `라우팅대상` 컬럼은 **이미 우리 백엔드 서비스 슬롯과 1:1 대응**하도록 설계되어 있다.
새 아키텍처를 만들 필요 없이, **영어 매뉴얼 원문을 한국어 코칭 원칙으로 정제(빌드타임) → Phase별 블록 조립(런타임)** 하면 된다.
**12주 유지**하되, Phase 3 구간(W4–11)에서는 **모듈 분류기**가 환자별 모듈 1~2개를 자동 선택해 콘텐츠를 제공한다(3절 C).

## 1. Layer → 시스템 프롬프트 슬롯 매핑

| CBI Layer | 항목수 | 라우팅대상 | 코드 슬롯 | 현재 상태 |
|---|---|---|---|---|
| **COMMON** | 13 | `system_prompt_common_header` | `services/context_builder.py` `_BASE_PERSONA` | 하드코딩 1문단 |
| **PHASE_LLM** | 362 | `phase_1~4_system_prompt`, `phase_3_<9모듈>_system_prompt` | `_WEEK_PROMPTS` (주차별) | 한 줄 요약 |
| **PULLOUT** (MVP 활성) | RESU 18 · SOMA 21 · CRIS 7 · MISS 1 | `pullout_*_prompt` | `_RESU/_SOMA/_CRAVING_PROMPT` | 일부만 |
| **OUTPUT_GUARD** | 9 | `output_guard (active in PHASE_1+)` | `services/output_filter.py` | 자체 규칙 작성됨 |
| **EXAMPLE_CORPUS** | 46 | `few_shot_examples` | (없음) | **주입 금지** |
| PULLOUT_NON_MVP / CLINICIAN_LINK / DATA_STORE | 35+3+3 | — | 환자앱 미사용 | 제외 |

PHASE_LLM 362개의 라우팅대상 분포:
`phase_1`(83) `phase_2`(47) `phase_3_assn`(25) `phase_3_comm`(17) `phase_3_crav`(22)
`phase_3_dref`(50) `phase_3_jobf`(22) `phase_3_mood`(37) `phase_3_mutu`(5) `phase_3_sarc`(15)
`phase_3_ssso`(9) `phase_3_unmapped`(14) `phase_4`(16)

## 2. 핵심 난제 — 원문 직접 주입 금지

카탈로그 지시문은 **인간 치료자용 영어 매뉴얼 원문**이라 그대로 넣으면 안 된다.

- ✅ 좋은 규칙: "never ask three questions in a row", "A client's safety always has top priority"
- ❌ 페이지 오염/파편: "...below.", "2.6l.", 문장 중간에 "REFERENCE Form oo: Working Alliance Inventory" 삽입
- ❌ 치료자 행정업무: "You must complete a Session Record Form entry (Form A)..."
- ❌ EXAMPLE_CORPUS (분류기준 문서가 **명시 경고**): "THERAPIST: So it sounds like...", "JANET: This is the situation..." → BOB/JANET 캐릭터 발화를 LLM이 사실로 학습할 위험

→ **빌드타임 정제 → 런타임 조립** 2단계 파이프라인이 필요하다.

## 3. 적용 파이프라인

### (A) 빌드타임: 카탈로그 → 정제된 프롬프트 자산 (**한국어**)

`scripts/build_cbi_prompts.py`:
1. **필터링**: 페이지 파편 · Form 행정(DATA_STORE) · EXAMPLE_CORPUS · 비MVP Layer 제거
2. **한국어 정제**: 영어 원문 → 한국어 코칭 원칙으로 압축·중복 제거
   - 1차: Claude(Sonnet/Opus)로 라우팅대상 그룹별 정제
   - 2차: **임상 검토 필수** (false positive/negative, 임상 적절성)
3. **버전 자산 출력**: `app/prompts/cbi/v3/{common, phase_1, ..., phase_3_crav, ..., pullout_resu, ...}.yaml`

> 자산을 코드에서 분리 → 임상가가 프롬프트를 직접 리뷰/수정 가능, 카탈로그 v4 재생성 시 코드 무수정.

자산 포맷(안):
```yaml
# app/prompts/cbi/v3/phase_3_crav.yaml
routing_target: phase_3_crav_system_prompt
source_ids: [22개 원본 ID]
catalog_version: v3
principles_ko:
  - 갈망은 파도처럼 밀려왔다 빠진다는 점을 환자가 체감하도록 돕는다 (urge surfing).
  - ...
```

### (B) 런타임: context_builder 조립

```
시스템 프롬프트 = COMMON(13)  +  [현재 주차의 Phase/모듈 블록]  (+ 분기 시 PULLOUT 블록)
```
362개 전부가 아니라 **현재 주차 해당 1~2개 블록만** 주입 → 토큰 절약 + 집중도.

### (C) 콘텐츠 선택 모델 — 12주 유지 + Phase 3 모듈 분류기 (확정 2026-05-24)

> 결정: **무거운 상태머신·큐를 만들지 않는다.** 12주 타임라인을 그대로 유지하고,
> Phase 3 구간에서만 **환자에게 맞는 모듈을 자동 선택하는 분류기 1개**를 추가해
> 콘텐츠를 제공한다. 이 단순화로 임상 지적을 핵심만 수용한다(아래).

**주차 → Phase 결정 (결정론적 매핑 — 코드 한 줄)**
| 주차 | Phase | 콘텐츠 |
|---|---|---|
| W1 | Phase 1 | PHASE_1 (동기 강화) |
| W2–3 | Phase 2 | PHASE_2 (기능분석 — 트리거 파악) |
| **W4–11** | **Phase 3** | **분류기가 선택한 모듈 블록** |
| W12 | Phase 4 | PHASE_4 (종결) |

→ Phase 2(W2–3)가 Phase 3(W4–11)보다 앞서므로 **"기능분석이 모듈에 선행"(매뉴얼 §1)이 자동 충족**.
별도 phase 게이트·완료 마커 불필요(주차 순서가 게이트 역할).

**Phase 3 모듈 분류기 (신규 — 이것만 추가)**
- 새 서비스 `services/module_classifier.py` (Haiku — 기존 classifier 티어와 동일).
- **입력(기능분석 대용 데이터):** `discharge_profile.normalized_triggers` + 최근 체크인(갈망·기분 추이)
  + 직전 세션요약의 `identified_triggers`/`key_insights`/기수강 모듈 + `comorbidities`.
- **출력:** 이번 세션 모듈 **1~2개** + 선택 근거 한 줄 + confidence.
- 출력을 **최대 2개로 캡** → 매뉴얼 "동시 ≤2"(§2.6)를 별도 불변식 엔진 없이 자연 충족.
- 매뉴얼 §1·§5(환자별 개별 모듈 선택)도 분류기로 충족.

**모듈 ↔ 신호 매핑 (분류기 가이드)**
| 모듈 | 발동 신호 | 매뉴얼 절 |
|---|---|---|
| CRAV | 갈망·트리거가 주요 선행요인 | §5.3 |
| DREF | 사회적 권유·압력 | §5.4 |
| MOOD | 우울·불안(STORC), 동반질환 | §5.6 |
| ASSN / COMM | 대인 갈등·의사소통 결핍 | §5.1 / §5.2 |
| JOBF / SARC | 직업·여가 공백 | §5.5 / §5.8 |
| SSSO / MUTU | 단주 지지망 부족 | §5.9 / §5.7 |

> 신호 매핑은 매뉴얼이 모듈 목적만 규정(정렬 우선순위 미규정) → [C] 시스템설계 + [D] 임상추론.
> 분류기 프롬프트의 가이드로만 사용하고, **임상 자문에서 검증.** PHASE_3_UNMAPPED 14개는 보류.

**Pull-out 트리거 (주차 무관, 조건 발동, §4) — 변경 없음, 이미 동작**
| 모듈 | 발동 조건 | MVP 상태 |
|---|---|---|
| RESU | 재음주 보고 | 활성 (`safety_classifier` `switch_resu`) |
| SOMA | 복약 중단 의사/사실 | 활성 (`safety_classifier` `switch_soma`) |
| CRIS | 위기 신호 | 비활성 (명세서 v3.0, feature flag off) |

### (D) PROHIBITION의 위치 분리 (역할 분리)

- **생성 프롬프트(COMMON+Phase)** = 긍정적 코칭 원칙만.
- **사후 검증(OUTPUT_GUARD)** = "~하지 마라" 류 9개를 `output_filter.py`에 통합.
- 이미 생성/검증이 분리된 구조이므로 카탈로그의 PROHIBITION을 올바른 슬롯에 배치.

### (E) PULLOUT 분기

- RESU/SOMA는 safety_classifier의 `switch_resu`/`switch_soma`로 이미 context 전환됨 → 해당 블록 주입.
- CRIS(7)는 안전 분기. 현재 grade A는 즉시 lock 처리되므로 CRIS 블록은 보조적.
- MISS(1)는 비활성 후보. 현 MVP에선 보류 가능.

### (F) EXAMPLE_CORPUS — 시스템 프롬프트 제외

분류기준 문서의 명시 경고 준수. 추후 사용 시 `system`이 아닌 `messages`에 정제된 few-shot으로만, 캐릭터/사실 혼동 방지 처리. **MVP 범위 외.**

### (G) 캐싱 (선택 강화)

COMMON+Phase 헤더는 고정 → Anthropic **prompt caching**(`cache_control`) 적용 시 매 턴 입력 토큰 절감.
현재 `llm_gateway.py`는 `system`을 평문 문자열로 전달 → 구조화 system 블록 지원이 별도 필요.

## 3-2. 오케스트레이션 영향 (단순화안: 12주 + 분류기) — 확정 2026-05-24

12주 타임라인을 유지하므로 **모델/마이그레이션 변경이 거의 없다.** 핵심은 분류기 1개 + context_builder 조립.

| 영역 | 현재 | 필요 변경 | 규모 |
|---|---|---|---|
| **신규 `services/module_classifier.py`** | 없음 | Phase 3 주차에서 환자 데이터→모듈 1~2개 선택(Haiku). 출력 ≤2 캡 | 신규(소~중) |
| **context_builder.py** | `_WEEK_PROMPTS` 주차 룩업(L31·L128) | 주차→Phase 결정 + Phase 3면 분류기 호출→모듈 블록 주입. 자산 로딩 | 중 |
| **internal.py** | — | `ContextBuildResponse`에 선택 모듈/근거 노출(선택) | 소 |
| **트리거(Pull-out)** | `switch_resu/soma` 존재 ✅ | **변경 없음.** CRIS는 flag off 유지 | 없음 |
| **models/** | `current_week`(12주) 그대로 사용 | **변경 없음** (선택 모듈 기록이 필요하면 `Session.selected_modules` 컬럼 1개 추가 — MVP 생략 가능) | 없음~소 |
| `current_phase`·`stage_tracker`·`le=12` | 현행 유지 | **변경 없음** (주차=phase 결정론적, 12주 확정) | 없음 |

## 4. 작업 순서 (확정된 방안)

1. `scripts/build_cbi_prompts.py` — 필터 + Claude 한국어 정제 → 자산 생성
2. `app/prompts/cbi/v3/*.yaml` — 임상 리뷰 가능한 프롬프트 자산 (COMMON / PHASE_1·2·4 / phase_3 9모듈 / pullout)
3. **`services/module_classifier.py` (신규)** — Phase 3 모듈 선택기(Haiku, 출력 ≤2)
4. `services/context_builder.py` 리팩터 — 주차→Phase 결정 + Phase 3면 분류기 호출 + 자산 조립(주차 고정표 폐기)
5. `services/output_filter.py` — OUTPUT_GUARD 9개 반영
6. `prompt_version`을 카탈로그 버전(v3)과 연동
7. (선택) `Session.selected_modules` 기록 / `llm_gateway.py` 프롬프트 캐싱

## 5. 결정 사항

- **기간**: 12주 유지 (변경 없음).
- **Phase 3 콘텐츠**: 주차 고정표 대신 **모듈 분류기**가 환자별 모듈 1~2개 자동 선택.
- **단순화**: phase 상태머신·모듈 큐 테이블·≤2 불변식 엔진 **만들지 않음**. 모델/마이그레이션 변경 최소.
- **프롬프트 언어**: 한국어로 정제 (앱 코치 페르소나 일치). 1차 Claude 정제 + 임상 검토 필수.
- **현재 단계**: 방안 확정. 구현은 팀·임상 검토 후 착수.

## 6. 검토 체크포인트 (구현 전 확정 필요)

- [ ] **모듈 ↔ 신호 매핑 임상 자문** (분류기 가이드, [C]+[D] 매뉴얼 미규정 영역) (3절 C)
- [ ] 분류기 입력 데이터 충분성 (트리거·체크인·세션요약으로 모듈 판별 가능한지)
- [ ] 한국어 정제 결과 임상 검토 (false positive/negative)
- [ ] `services/` 수정은 시니어 검토 영역 (`routers/CLAUDE.md` 절대규칙)
- [ ] PHASE_3_UNMAPPED 14개 처리 방침
- [ ] 선택 모듈을 의료진 포털에 노출할지(→ `Session.selected_modules` 기록 여부)
