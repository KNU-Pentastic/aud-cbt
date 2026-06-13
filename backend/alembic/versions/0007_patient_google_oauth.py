"""환자 구글 OAuth 연동 컬럼

환자 구글 OAuth 2.1 회원가입/로그인을 위해 patients 에 google_sub(구글 고유
식별자, unique)와 email(암호화 저장)을 추가한다. (#4)

Revision ID: 0007_patient_google_oauth
Revises: 0006_safety_event_reasoning
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_patient_google_oauth"
down_revision = "0006_safety_event_reasoning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("google_sub", sa.String(length=255), nullable=True))
    # email 은 EncryptedString(255) → 저장 길이 255*3+120 = 885.
    op.add_column("patients", sa.Column("email", sa.String(length=885), nullable=True))
    op.create_unique_constraint("uq_patients_google_sub", "patients", ["google_sub"])


def downgrade() -> None:
    op.drop_constraint("uq_patients_google_sub", "patients", type_="unique")
    op.drop_column("patients", "email")
    op.drop_column("patients", "google_sub")
