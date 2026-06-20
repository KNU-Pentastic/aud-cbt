"""저장 PII 암호화 컬럼 확장 + 접속기록 테이블

개인정보의 안전성 확보조치 기준 §7(암호화)·§8(접속기록) 대응.

1) patients.name/phone, safety_events.raw_text 를 애플리케이션 레벨 Fernet 암호문으로
   저장한다. 암호문은 평문보다 길어 컬럼 길이를 넓힌다. 기존 평문 행은
   EncryptedString.decrypt() 가 그대로 통과시키므로 데이터 마이그레이션은 선택적이다
   (다음 쓰기 시 자동 암호화, 시드 재생성 시 전부 암호화).
2) access_logs 테이블 신설(의료진의 환자 개인정보 열람/변경 append-only 기록).

Revision ID: 0005_pii_encryption_access_log
Revises: 0004_message_safety_excluded
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_pii_encryption_access_log"
down_revision = "0004_message_safety_excluded"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 암호문(base64)은 평문보다 길다 → 컬럼 길이 확장.
    op.alter_column("patients", "name", type_=sa.String(length=480), existing_nullable=False)
    op.alter_column("patients", "phone", type_=sa.String(length=240), existing_nullable=False)
    op.alter_column(
        "safety_events", "raw_text", type_=sa.String(length=12120), existing_nullable=True
    )

    op.create_table(
        "access_logs",
        sa.Column("access_log_id", sa.String(length=40), primary_key=True),
        sa.Column("actor_role", sa.String(length=20), nullable=False),
        sa.Column("actor_id", sa.String(length=40), nullable=True),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("patient_id", sa.String(length=40), nullable=True),
        sa.Column("request_id", sa.String(length=60), nullable=True),
        sa.Column("client_ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_access_logs_actor_id", "access_logs", ["actor_id"])
    op.create_index("ix_access_logs_patient_id", "access_logs", ["patient_id"])
    op.create_index("ix_access_logs_created_at", "access_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_access_logs_created_at", table_name="access_logs")
    op.drop_index("ix_access_logs_patient_id", table_name="access_logs")
    op.drop_index("ix_access_logs_actor_id", table_name="access_logs")
    op.drop_table("access_logs")

    op.alter_column(
        "safety_events", "raw_text", type_=sa.String(length=4000), existing_nullable=True
    )
    op.alter_column("patients", "phone", type_=sa.String(length=40), existing_nullable=False)
    op.alter_column("patients", "name", type_=sa.String(length=120), existing_nullable=False)
