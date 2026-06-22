"""Seed one demo patient per clinical scenario for the demo (provider portal + app).

Idempotent: re-running updates the existing scenario patients (matched by name)
instead of duplicating them. Patient name is stored with non-deterministic
encryption, so we dedupe by decrypting in Python rather than filtering in SQL.

Run inside the api container:
    docker exec backend-api-1 python -m scripts.seed_scenarios

Prints a table of: name | scenario | patient_id | registration code | PIN.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone

from app.config import settings
from app.database import SessionLocal
from app.ids import (
    checkin_id as new_checkin_id,
    discharge_profile_id as new_dp_id,
    patient_id as new_patient_id,
    registration_code as new_reg_code,
    safety_event_id as new_se_id,
    sso_id as new_sso_id,
)
from app.ids import medication_log_id as new_ml_id
from app.models.daily_checkin import DailyCheckin
from app.models.discharge_profile import DischargeProfile
from app.models.medication import MedicationLog
from app.models.patient import Patient
from app.models.provider import Provider
from app.models.registration_code import RegistrationCode
from app.models.safety_event import SafetyEvent
from app.models.support_person import SupportPerson
from app.security import hash_secret

PROVIDER_EMAIL = "demo.doctor@example.com"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_reg_code(db, patient_id: str) -> str:
    """Reuse an existing unconsumed, unexpired code; otherwise mint one."""
    existing = (
        db.query(RegistrationCode)
        .filter(RegistrationCode.patient_id == patient_id)
        .all()
    )
    for rc in existing:
        if rc.consumed_at is None and rc.expires_at > _now():
            return rc.code
    code = new_reg_code()
    db.add(
        RegistrationCode(
            code=code,
            patient_id=patient_id,
            expires_at=_now() + timedelta(days=settings.registration_code_ttl_days),
        )
    )
    return code


def _ensure_checkins(db, patient_id: str, days: int, mood: int, craving: int) -> None:
    if db.query(DailyCheckin).filter(DailyCheckin.patient_id == patient_id).count():
        return
    today = _now().date()
    for i in range(days):
        d = today - timedelta(days=i)
        db.add(
            DailyCheckin(
                checkin_id=new_checkin_id(),
                patient_id=patient_id,
                date=d,
                mood_nrs=max(0, min(10, mood + (i % 3))),
                craving_nrs=max(0, min(10, craving - (i % 4))),
                sleep_hours=6.0 + (i % 3),
                medication_records=[{"medication_name": "naltrexone", "taken": True}],
            )
        )


def _ensure_med_logs(db, patient_id: str, days: int) -> None:
    """Adherence is computed from MedicationLog; ~86% taken (skip every 7th day)."""
    if db.query(MedicationLog).filter(MedicationLog.patient_id == patient_id).count():
        return
    today = _now().date()
    for i in range(days):
        db.add(
            MedicationLog(
                medication_log_id=new_ml_id(),
                patient_id=patient_id,
                medication_name="naltrexone",
                date=today - timedelta(days=i),
                taken=(i % 7 != 0),
            )
        )


def _ensure_safety_events(db, patient_id: str, events: list[dict]) -> None:
    if db.query(SafetyEvent).filter(SafetyEvent.patient_id == patient_id).count():
        return
    for e in events:
        db.add(SafetyEvent(safety_event_id=new_se_id(), patient_id=patient_id, **e))


def _upsert_patient(db, provider_id: str, existing_by_name: dict, spec: dict) -> dict:
    name = spec["name"]
    p = existing_by_name.get(name)
    created = p is None
    if created:
        p = Patient(patient_id=new_patient_id(), provider_id=provider_id, name=name)
        db.add(p)

    p.provider_id = provider_id
    p.phone = spec["phone"]
    p.date_of_birth = spec["dob"]
    p.sex = spec["sex"]
    p.discharge_date = date.today() - timedelta(days=spec["sobriety_days"])
    p.next_outpatient_date = date.today() + timedelta(days=14)
    p.program_status = spec["program_status"]
    p.current_week = spec["current_week"]
    p.last_active_at = _now() - timedelta(hours=spec.get("last_active_hours_ago", 3))

    if spec["registered"]:
        p.is_registered = True
        p.pin_hash = hash_secret(spec["pin"])
    else:
        p.is_registered = False
        p.pin_hash = None

    if spec.get("llm_locked"):
        p.llm_locked = True
        p.llm_locked_at = _now() - timedelta(days=spec.get("locked_days_ago", 2))
        p.llm_lock_reason = "safety_event_grade_a"
    else:
        p.llm_locked = False
        p.llm_locked_at = None
        p.llm_lock_reason = None

    db.flush()  # ensure patient_id is usable for children

    # discharge profile (1:1)
    if p.discharge_profile is None:
        dp = DischargeProfile(discharge_profile_id=new_dp_id(), patient_id=p.patient_id)
        db.add(dp)
    else:
        dp = p.discharge_profile
    dp.diagnosis_severity = spec["severity"]
    dp.admission_days = spec["admission_days"]
    dp.suicide_ideation_history = spec["sih"]
    dp.medications = spec["medications"]
    dp.comorbidities = spec["comorbidities"]
    dp.primary_triggers_raw = spec["triggers_raw"]
    dp.normalized_triggers = spec["triggers"]

    # support person (1:1)
    if p.sso is None:
        sso = SupportPerson(sso_id=new_sso_id(), patient_id=p.patient_id)
        db.add(sso)
    else:
        sso = p.sso
    sso.name = spec["sso"]["name"]
    sso.relationship_type = spec["sso"]["relation"]
    sso.phone = spec["sso"]["phone"]

    if spec["registered"]:
        _ensure_checkins(db, p.patient_id, days=14, mood=spec.get("mood", 5), craving=spec.get("craving", 4))
        _ensure_med_logs(db, p.patient_id, days=30)
    _ensure_safety_events(db, p.patient_id, spec.get("safety_events", []))

    code = _ensure_reg_code(db, p.patient_id)
    return {
        "name": name,
        "scenario": spec["scenario"],
        "patient_id": p.patient_id,
        "code": code,
        "pin": spec["pin"] if spec["registered"] else "(앱에서 직접 설정)",
        "created": created,
    }


SCENARIOS = [
    {
        "name": "박서연", "scenario": "정상 진행 (플래그 없음)",
        "phone": "010-2200-4466", "dob": date(1990, 3, 12), "sex": "female",
        "sobriety_days": 21, "current_week": 2, "program_status": "active",
        "registered": True, "pin": "224466",
        "severity": "moderate", "admission_days": 12, "sih": "none",
        "medications": [{"name": "naltrexone", "dose": "50mg", "frequency": "once_daily"}],
        "comorbidities": ["anxiety"], "triggers_raw": "친구 모임, 스트레스",
        "triggers": ["social_pressure", "work_stress"],
        "sso": {"name": "박정민", "relation": "sibling", "phone": "010-1111-2222"},
        "mood": 6, "craving": 3,
    },
    {
        "name": "이영호", "scenario": "안전 플래그 B (재발 보고, 미확인)",
        "phone": "010-1357-9000", "dob": date(1983, 7, 5), "sex": "male",
        "sobriety_days": 47, "current_week": 4, "program_status": "active",
        "registered": True, "pin": "135790",
        "severity": "moderate", "admission_days": 18, "sih": "past",
        "medications": [
            {"name": "naltrexone", "dose": "50mg", "frequency": "once_daily"},
            {"name": "acamprosate", "dose": "666mg", "frequency": "three_times_daily"},
        ],
        "comorbidities": ["depression", "insomnia"],
        "triggers_raw": "퇴근 후 회식 자리, 부부 다툼 직후",
        "triggers": ["work_stress", "social_pressure", "interpersonal_conflict"],
        "sso": {"name": "이정훈", "relation": "spouse", "phone": "010-1234-5678"},
        "mood": 5, "craving": 6,
        "safety_events": [
            {
                "grade": "B", "event_type": "relapse", "source": "conversation_message",
                "recommended_action": "switch_resu", "matched_by": "both", "confidence": 0.88,
                "reasoning": "어제 실제 음주(한 잔)를 사후 보고하여 재발(grade B)로 분류 (규칙 키워드 동시 일치)",
                "matched_keyword": "어제 한 잔", "evidence_span": "어제 한 잔 했어요",
                "raw_text": "사실 어제 한 잔 했어요. 너무 힘들어서요.",
                "detected_at": _now() - timedelta(days=1, hours=2),
            }
        ],
    },
    {
        "name": "정재훈", "scenario": "LLM 잠금 + 응급 A (자살위험)",
        "phone": "010-4829-1700", "dob": date(1978, 11, 23), "sex": "male",
        "sobriety_days": 89, "current_week": 8, "program_status": "active",
        "registered": True, "pin": "482917", "llm_locked": True, "locked_days_ago": 2,
        "severity": "severe", "admission_days": 31, "sih": "during_admission",
        "medications": [{"name": "disulfiram", "dose": "250mg", "frequency": "once_daily"}],
        "comorbidities": ["depression", "anxiety"],
        "triggers_raw": "야간 불면, 외로움",
        "triggers": ["sleep_disturbance", "loneliness"],
        "sso": {"name": "정수민", "relation": "sibling", "phone": "010-9876-5432"},
        "mood": 3, "craving": 6,
        "safety_events": [
            {
                "grade": "A", "event_type": "suicide_risk", "source": "conversation_message",
                "recommended_action": "llm_lock_p4", "matched_by": "llm_classifier", "confidence": 0.94,
                "reasoning": "삶을 끝내고 싶다는 직접적 자살 사고 표현 → 응급(grade A). 즉시 LLM 잠금.",
                "evidence_span": "다 끝내고 싶어요",
                "raw_text": "요즘 다 끝내고 싶어요. 의미가 없어요.",
                "detected_at": _now() - timedelta(days=2, hours=1),
            },
            {
                "grade": "B", "event_type": "medication_stop", "source": "checkin_free_note",
                "recommended_action": "switch_soma", "matched_by": "rule_keyword", "confidence": 0.80,
                "reasoning": "규칙 키워드 일치로 복약 중단(grade B) 분류",
                "matched_keyword": "약 안 먹", "evidence_span": "약 안 먹은 지 3일째",
                "raw_text": "약 안 먹은 지 3일째예요.",
                "detected_at": _now() - timedelta(days=3),
            },
        ],
    },
    {
        "name": "최지원", "scenario": "프로그램 완료 (completed)",
        "phone": "010-7788-9900", "dob": date(1995, 1, 30), "sex": "female",
        "sobriety_days": 124, "current_week": 12, "program_status": "completed",
        "registered": True, "pin": "778899",
        "severity": "severe", "admission_days": 21, "sih": "none",
        "medications": [{"name": "naltrexone", "dose": "50mg", "frequency": "once_daily"}],
        "comorbidities": [], "triggers_raw": "특별한 트리거 없음, 습관성 음주",
        "triggers": ["habitual"],
        "sso": {"name": "최성호", "relation": "parent", "phone": "010-3333-4444"},
        "mood": 7, "craving": 2,
    },
    {
        "name": "한도윤", "scenario": "신규/등록 대기 (앱 온보딩 테스트용)",
        "phone": "010-8000-1000", "dob": date(2000, 9, 9), "sex": "male",
        "sobriety_days": 8, "current_week": 1, "program_status": "active",
        "registered": False, "pin": "",
        "severity": "moderate", "admission_days": 10, "sih": "none",
        "medications": [{"name": "naltrexone", "dose": "50mg", "frequency": "once_daily"}],
        "comorbidities": ["anxiety"], "triggers_raw": "시험 스트레스, 친구 권유",
        "triggers": ["work_stress", "social_pressure"],
        "sso": {"name": "한지우", "relation": "parent", "phone": "010-5555-6666"},
    },
]


def main() -> int:
    db = SessionLocal()
    try:
        provider = db.query(Provider).filter_by(email=PROVIDER_EMAIL).one_or_none()
        if provider is None:
            print(f"ERROR: provider {PROVIDER_EMAIL} not found. Run seed_demo first.")
            return 1

        existing = db.query(Patient).filter_by(provider_id=provider.provider_id).all()
        existing_by_name = {p.name: p for p in existing}

        results = [_upsert_patient(db, provider.provider_id, existing_by_name, s) for s in SCENARIOS]
        db.commit()

        print("=" * 78)
        print(f"SCENARIO SEED COMPLETE  (provider: {provider.provider_id} / {PROVIDER_EMAIL})")
        print("=" * 78)
        print(f"{'이름':<8}{'시나리오':<32}{'코드':<11}{'PIN':<16}{'상태'}")
        print("-" * 78)
        for r in results:
            tag = "신규" if r["created"] else "갱신"
            print(f"{r['name']:<8}{r['scenario']:<32}{r['code']:<11}{r['pin']:<16}{tag}")
        print("=" * 78)
        print("로그인(앱): 등록 코드 + PIN. 미등록 환자는 앱에서 코드 입력 후 PIN 설정.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
