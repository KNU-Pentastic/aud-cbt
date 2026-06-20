"""구글 OAuth 연동 제거 — google_sub 컬럼 삭제

OAuth(구글 로그인) 기능을 제거하면서 patients.google_sub 와 그 unique 제약을
드롭한다. email 컬럼은 이메일 회원가입에서 계속 사용하므로 유지한다(0007 에서 생성).

이미 0007 이 적용된 DB 에서도 안전하게 정리되도록 forward 마이그레이션으로 처리한다.

Revision ID: 0009_drop_google_oauth
Revises: 0008_patient_email_auth
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_drop_google_oauth"
down_revision = "0008_patient_email_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 적용 안 된 DB 에서도 깨지지 않도록 제약/컬럼 존재 여부에 관대하게.
    op.execute("ALTER TABLE patients DROP CONSTRAINT IF EXISTS uq_patients_google_sub")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS google_sub")


def downgrade() -> None:
    op.add_column("patients", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_patients_google_sub", "patients", ["google_sub"])
