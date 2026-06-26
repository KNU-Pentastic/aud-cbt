"""환자 이메일 회원가입 컬럼

이메일+비밀번호 회원가입을 위해 patients 에 password_hash 와 email_lookup(이메일의
결정론적 blind index, unique)을 추가한다. email 자체는 0007 에서 암호화 컬럼으로
이미 추가됨.

Revision ID: 0008_patient_email_auth
Revises: 0007_patient_google_oauth
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_patient_email_auth"
down_revision = "0007_patient_google_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("patients", sa.Column("email_lookup", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_patients_email_lookup", "patients", ["email_lookup"])


def downgrade() -> None:
    op.drop_constraint("uq_patients_email_lookup", "patients", type_="unique")
    op.drop_column("patients", "email_lookup")
    op.drop_column("patients", "password_hash")
