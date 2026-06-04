#!/usr/bin/env python3
"""백엔드 실제 분류기로 Single_Turn_Quick(ST-*) 단일 발화 스모크 테스트.

멀티턴 ★ 9턴은 전부 LLM 레이어만 발동했으므로(matched_by=llm_classifier),
ST 직설/함정 발화로 '룰 키워드 레이어'를 포함한 전체 경로를 검증한다.
ST는 단일 발화(맥락 없음)가 설계 의도 → recent_dialogue=[].
"""
import io, os, sys, importlib.util
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DOCS = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(DOCS, "AUD_CBT_멀티턴_안전분류_테스트시나리오.xlsx")
RUNNER = os.path.join(DOCS, "safty_test_runner.py")
OUT = os.path.join(DOCS, "AUD_CBT_멀티턴_안전분류_테스트시나리오_backend_ST_results.xlsx")
RUNS = 5

spec = importlib.util.spec_from_file_location("runner", RUNNER)
R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)

from app.config import settings
from app.services import safety_classifier as SC
from app.services import llm_gateway as GW
from app.schemas.internal import SafetyClassifyRequest, LLMInvokeRequest

GW._check_quota = lambda db, pid: 10**9
GW._record_usage = lambda *a, **k: None

class FakeDB:
    def add(self, *a, **k): pass
    def get(self, *a, **k): return None
    def commit(self): pass
    def refresh(self, *a, **k): pass
DB = FakeDB()

def norm(g):
    return {"A": "A", "B": "B", "none": "GENERAL"}.get(g, "GENERAL")

def preflight():
    mode = GW.effective_mode()
    print(f"[preflight] LLM 모드={mode['mode']} 분류기모델={settings.llm_model_classifier}")
    if mode["mode"] != "real":
        sys.exit("중단: 실제 LLM 모드 아님(mock).")
    GW.invoke(DB, LLMInvokeRequest(
        model=settings.llm_model_classifier, messages=[{"role": "user", "content": "ping"}],
        system="reply with json", max_tokens=20, temperature=0.0, stream=False,
        patient_id="t", purpose="safety_classification", caller_component="safety_classifier"))
    print("[preflight] 모델 alias 호출 OK\n")

def main():
    preflight()
    ws = R.load_workbook(XLSX)["Single_Turn_Quick"]
    rows = []
    for r in range(2, ws.max_row + 1):
        sid = ws.cell(r, 1).value
        text = ws.cell(r, 3).value
        exp_raw = ws.cell(r, 4).value or ""
        if not (sid and text):
            continue
        rows.append({"id": str(sid).strip(), "signal": ws.cell(r, 2).value or "",
                     "text": str(text).strip(), "exp_raw": str(exp_raw).strip(),
                     "expected": R.expected_set(str(exp_raw)), "row": r})

    print(f"ST 단일 발화 {len(rows)}개 × {RUNS}회 = {len(rows)*RUNS}회 "
          f"(백엔드 실제 classify, {settings.llm_model_classifier})\n")

    results = []
    for x in rows:
        preds, pf, detail = [], [], []
        for _ in range(RUNS):
            resp = SC.classify(DB, SafetyClassifyRequest(
                patient_id="test-patient-0001", text=x["text"],
                source="conversation_message", recent_dialogue=[]))
            g = norm(resp.grade)
            preds.append(g)
            pf.append("P" if g in x["expected"] else "F")
            detail.append((resp.grade, resp.event_type, resp.matched_by,
                           round(resp.confidence, 2), resp.recommended_action))
        results.append({**x, "preds": preds, "pf": pf, "detail": detail})

    print("=" * 84); print(" 백엔드 실제 분류기 — Single_Turn_Quick 결과"); print("=" * 84)
    for x in results:
        npass = x["pf"].count("P"); verdict = "PASS" if npass == RUNS else "FAIL"
        d0 = x["detail"][0]
        print(f"  {x['id']:<6} 기대={sorted(x['expected'])!s:<16} 예측={x['preds']}  "
              f"{npass}/{RUNS} [{verdict}]")
        print(f"         발화: {x['text']}")
        print(f"         ↳ grade={d0[0]} event={d0[1]} matched_by={d0[2]} "
              f"conf={d0[3]} action={d0[4]}")

    # 지표: 정확도 / 등급A 재현율 / 거짓양성 / 룰 레이어 발동 분포
    labels = ["A", "B", "GENERAL"]
    confusion = defaultdict(lambda: defaultdict(int))
    n_ok = total = 0
    fnA = fnAt = fp = fpt = 0
    matched_dist = defaultdict(int)
    rule_fp = []
    for x in results:
        exp = x["expected"]
        exp_label = "A" if exp == {"A"} else ("B" if exp == {"B"} else "GENERAL")
        for i, p in enumerate(x["preds"]):
            confusion[exp_label][p] += 1
            total += 1
            if p in exp:
                n_ok += 1
            matched_dist[x["detail"][i][2]] += 1
            if exp_label == "A":
                fnAt += 1
                if p != "A": fnA += 1
            if exp_label == "GENERAL":
                fpt += 1
                if p in ("A", "B"):
                    fp += 1
                    if x["detail"][i][2] in ("rule_keyword", "both"):
                        rule_fp.append((x["id"], x["detail"][i][1], x["detail"][i][2]))
    rate = lambda n, d: f"{(100*n/d):.0f}% ({n}/{d})" if d else "-"
    print("-" * 84)
    print(f"  정확도(Accuracy)             : {rate(n_ok, total)}")
    print(f"  등급 A 재현율(Recall) ★최우선 : {rate(fnAt-fnA, fnAt)}  (놓침 {fnA})")
    print(f"  거짓 양성률(일반→등급)        : {rate(fp, fpt)}")
    print(f"  판정 주체 분포(matched_by)    : {dict(matched_dist)}")
    if rule_fp:
        print(f"  ⚠ 룰 레이어發 거짓양성        : {rule_fp}")
    print("-" * 84)
    print("  혼동 행렬 (행=기대, 열=예측)")
    print("            " + "".join(f"{l:>10}" for l in labels))
    for el in labels:
        row = confusion.get(el, {})
        print(f"    {el:<8}" + "".join(f"{row.get(p,0):>10}" for p in labels))
    print("=" * 84)

    # 결과 저장: ST 시트에 예측/판정/matched_by 컬럼 추가
    wb = R.load_workbook(XLSX); sh = wb["Single_Turn_Quick"]
    sh.cell(1, 6).value = "예측(5회)"; sh.cell(1, 7).value = "판정"
    sh.cell(1, 8).value = "matched_by"; sh.cell(1, 9).value = "event_type"
    for x in results:
        npass = x["pf"].count("P")
        sh.cell(x["row"], 6).value = ",".join(x["preds"])
        sh.cell(x["row"], 7).value = "PASS" if npass == RUNS else "FAIL"
        sh.cell(x["row"], 8).value = x["detail"][0][2]
        sh.cell(x["row"], 9).value = x["detail"][0][1]
    wb.save(OUT)
    print(f"\n결과 저장: {OUT}")

if __name__ == "__main__":
    main()
