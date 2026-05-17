"""Seed a demo provider + one fully-registered patient for local development.

Usage (from backend/ with .env loaded):
    python -m scripts.seed_demo

Prints:
    - Provider email/password/TOTP secret (with otpauth:// URI)
    - Patient ID and a fresh registration code (with PIN you choose)
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone

import pyotp

from app.config import settings
from app.database import SessionLocal
from app.ids import (
    discharge_profile_id,
    patient_id as new_patient_id,
    provider_id as new_provider_id,
    registration_code as new_reg_code,
    sso_id as new_sso_id,
)
from app.models.discharge_profile import DischargeProfile
from app.models.patient import Patient
from app.models.provider import Provider
from app.models.registration_code import RegistrationCode
from app.models.support_person import SupportPerson
from app.security import hash_secret


DEMO_PROVIDER_EMAIL = "demo.doctor@example.com"
DEMO_PROVIDER_PASSWORD = "DemoPassword!2026"
DEMO_PATIENT_PIN = "482917"


def main() -> None:
    db = SessionLocal()
    try:
        existing = db.query(Provider).filter_by(email=DEMO_PROVIDER_EMAIL).one_or_none()
        if existing:
            print(f"Provider already exists: {existing.provider_id} ({existing.email})")
            print("  → re-run after dropping the table if you want a fresh seed.")
            return

        totp_secret = pyotp.random_base32()
        provider = Provider(
            provider_id=new_provider_id(),
            email=DEMO_PROVIDER_EMAIL,
            password_hash=hash_secret(DEMO_PROVIDER_PASSWORD),
            totp_secret=totp_secret,
            name="데모 주치의",
            affiliation="강원대학교병원 정신건강의학과",
        )
        db.add(provider)
        db.flush()

        pid = new_patient_id()
        patient = Patient(
            patient_id=pid,
            provider_id=provider.provider_id,
            name="홍길동",
            phone="010-1234-5678",
            date_of_birth=date(1985, 4, 1),
            sex="male",
            discharge_date=date.today() - timedelta(days=7),
            next_outpatient_date=date.today() + timedelta(days=14),
            program_status="active",
            current_week=2,
        )
        profile = DischargeProfile(
            discharge_profile_id=discharge_profile_id(),
            patient_id=pid,
            diagnosis_severity="severe",
            admission_days=14,
            suicide_ideation_history="past",
            medications=[{"name": "naltrexone", "dose": "50mg", "frequency": "once_daily"}],
            comorbidities=["depression", "insomnia"],
            primary_triggers_raw="회식 자리에서 동료들 권유, 야근 후 혼술",
            normalized_triggers=["social_pressure", "work_stress"],
        )
        sso = SupportPerson(
            sso_id=new_sso_id(),
            patient_id=pid,
            name="배우자",
            relationship_type="spouse",
            phone="010-9999-8888",
        )
        db.add_all([patient, profile, sso])

        code = new_reg_code()
        rc = RegistrationCode(
            code=code,
            patient_id=pid,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.registration_code_ttl_days),
        )
        db.add(rc)
        db.commit()

        otp_uri = pyotp.TOTP(totp_secret).provisioning_uri(
            name=DEMO_PROVIDER_EMAIL, issuer_name="AUD-CBT"
        )

        print("=" * 60)
        print("DEMO SEED COMPLETE")
        print("=" * 60)
        print(f"Provider ID  : {provider.provider_id}")
        print(f"Email        : {DEMO_PROVIDER_EMAIL}")
        print(f"Password     : {DEMO_PROVIDER_PASSWORD}")
        print(f"TOTP secret  : {totp_secret}")
        print(f"TOTP URI     : {otp_uri}")
        print(f"  (load this URI into Google Authenticator / 1Password)")
        print()
        print(f"Patient ID   : {pid}")
        print(f"Reg code     : {code}   (use to call POST /v1/auth/patient/register)")
        print(f"Suggested PIN: {DEMO_PATIENT_PIN}")
        print(f"Reg code TTL : {settings.registration_code_ttl_days} days")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
