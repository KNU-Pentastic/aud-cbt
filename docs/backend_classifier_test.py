#!/usr/bin/env python3
"""백엔드 '실제' 안전 분류기(룰+LLM 하이브리드)로 멀티턴 시나리오를 검증.

safty_test_runner.py 의 예시 분류기(CLASSIFIER_SYSTEM) 대신,
backend/app/services/safety_classifier.classify() 를 그대로 호출한다.
 - 룰 키워드 레이어 + LLM(_LLM_SYSTEM, claude-haiku-4-5) 하이브리드 전체 경로
 - 둘 중 높은 등급 채택 로직까지 실제 배포 코드 그대로
DB 영속화(쿼터 체크/usage 기록/SafetyEvent 저장/환자 잠금)는 분류 '판정'에
영향이 없는 부수효과이므로 신선 상태로 스텁한다(쿼터 무제한, 저장 no-op).

실행: cwd=backend, env: DATABASE_URL=sqlite:// (psycopg2/라이브DB 불필요),
      ANTHROPIC_API_KEY·USE_LLM_MOCK=false 는 backend/.env 가 제공.
"""
import io, os, sys, json, importlib.util
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DOCS = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(DOCS, "AUD_CBT_멀티턴_안전분류_테스트시나리오.xlsx")
RUNNER = os.path.join(DOCS, "safty_test_runner.py")
OUT = os.path.join(DOCS, "AUD_CBT_멀티턴_안전분류_테스트시나리오_backend_results.xlsx")
RUNS = 5

# --- 시나리오 파싱/맥락 구성은 러너 코드를 그대로 재사용 (apples-to-apples) ---
spec = importlib.util.spec_from_file_location("runner", RUNNER)
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)

# --- 백엔드 실제 모듈 ---
from app.config import settings
from app.services import safety_classifier as SC
from app.services import llm_gateway as GW
from app.schemas.internal import SafetyClassifyRequest, DialogueTurn, LLMInvokeRequest

# --- DB 영속화만 스텁 (분류 판정에는 영향 없음) ---
GW._check_quota = lambda db, pid: 10**9          # 쿼터 무제한
GW._record_usage = lambda *a, **k: None          # usage 기록 no-op

class FakeDB:
    def add(self, *a, **k): pass
    def get(self, *a, **k): return None           # 환자 잠금 블록 skip(부수효과)
    def commit(self): pass
    def refresh(self, *a, **k): pass
DB = FakeDB()

def norm(grade):  # 백엔드 grade → 러너 라벨
    return {"A": "A", "B": "B", "none": "GENERAL"}.get(grade, "GENERAL")

def to_request(job):
    rd = []
    for t in job["recent_turns"]:
        if not t["text"]:
            continue
        role = "user" if t["role"] == "patient" else "assistant"
        rd.append(DialogueTurn(role=role, text=t["text"]))
    return SafetyClassifyRequest(
        patient_id="test-patient-0001",
        text=job["current_utterance"],
        source="conversation_message",
        recent_dialogue=rd,
    )

def preflight():
    mode = GW.effective_mode()
    print(f"[preflight] LLM 모드={mode['mode']} 이유={mode.get('reason')} "
          f"분류기모델={settings.llm_model_classifier}")
    if mode["mode"] != "real":
        sys.exit("중단: 실제 LLM 모드가 아닙니다 (mock 폴백). API 키/패키지 확인 필요.")
    # 모델 alias 가 유효한지 직접 호출로 확인 (_llm_classify 는 예외를 삼키므로 사전 점검)
    resp = GW.invoke(DB, LLMInvokeRequest(
        model=settings.llm_model_classifier,
        messages=[{"role": "user", "content": "사라지고 싶어요. 다 끝내고 싶어요."}],
        system=SC._LLM_SYSTEM, max_tokens=200, temperature=0.0, stream=False,
        patient_id="test-patient-0001", purpose="safety_classification",
        caller_component="safety_classifier"))
    print(f"[preflight] 모델 alias 호출 OK → {resp.content.strip()[:80]}")

def main():
    preflight()
    sc = R.parse_scenarios(R.load_workbook(XLSX)["Multiturn_Scenarios"])
    jobs = R.build_eval_jobs(sc, context_turns=3)
    print(f"\n시나리오 {len(sc)}개, 평가 턴 {len(jobs)}개, 턴당 {RUNS}회 "
          f"→ 총 {len(jobs)*RUNS}회 (백엔드 실제 classify, {settings.llm_model_classifier})\n")

    results = []
    for job in jobs:
        preds, pf, detail = [], [], []
        for _ in range(RUNS):
            resp = SC.classify(DB, to_request(job))
            g = norm(resp.grade)
            preds.append(g)
            pf.append("P" if g in job["expected"] else "F")
            detail.append((resp.grade, resp.event_type, resp.matched_by,
                           round(resp.confidence, 2), resp.recommended_action))
        results.append({"id": job["id"], "turn": job["turn"],
                        "expected": job["expected"], "preds": preds, "pf": pf,
                        "detail": detail})

    # --- 콘솔 요약 (러너 형식 + matched_by/event_type/action) ---
    print("=" * 78); print(" 백엔드 실제 분류기 — 실행 요약"); print("=" * 78)
    for res in results:
        npass = res["pf"].count("P"); verdict = "PASS" if npass == RUNS else "FAIL"
        d0 = res["detail"][0]
        print(f"  {res['id']:<8} {res['turn']:<4} 기대={sorted(res['expected'])!s:<16} "
              f"예측={res['preds']}  {npass}/{RUNS} [{verdict}]")
        print(f"           ↳ grade={d0[0]} event={d0[1]} matched_by={d0[2]} "
              f"conf={d0[3]} action={d0[4]}")

    summ = R.summarize(results)
    fnA, fnAt = summ["fn_A"]; fnB, fnBt = summ["fn_B"]; fp, fpt = summ["fp"]
    rate = lambda n, d: f"{(100*n/d):.0f}% ({n}/{d})" if d else "-"
    print("-" * 78)
    print(f"  등급 A 거짓 음성률 (놓침, 최우선): {rate(fnA, fnAt)}")
    print(f"  등급 B 거짓 음성률            : {rate(fnB, fnBt)}")
    print(f"  거짓 양성률 (과대경보)        : {rate(fp, fpt)}")
    print("-" * 78)
    print("  혼동 행렬 (행=기대, 열=예측)")
    labels = ["A", "B", "GENERAL"]
    print("            " + "".join(f"{l:>10}" for l in labels))
    for el in labels:
        row = summ["confusion"].get(el, {})
        print(f"    {el:<8}" + "".join(f"{row.get(p,0):>10}" for p in labels))
    print("=" * 78)

    # --- 결과 xlsx 기록 (원본/러너 결과 보존, 별도 파일) ---
    wb = R.load_workbook(XLSX)
    R.write_scoring(wb["Scoring_Sheet"], results, RUNS)
    wb.save(OUT)
    print(f"\n결과 저장: {OUT}")
    if fnA > 0:
        print("[경고] 등급 A 거짓 음성 발생 — 안전 기준 미달.")

if __name__ == "__main__":
    main()
