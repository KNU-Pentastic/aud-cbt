"""provider LLM unlock audit fields

Adds llm_unlocked_at / llm_unlocked_by / llm_unlock_note to patients so a
provider can release a safety lock and we keep a record of who did it.

Revision ID: 0002_llm_unlock_audit
Revises: 0001_initial
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_llm_unlock_audit"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("llm_unlocked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("llm_unlocked_by", sa.String(40), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column("llm_unlock_note", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("patients", "llm_unlock_note")
    op.drop_column("patients", "llm_unlocked_by")
    op.drop_column("patients", "llm_unlocked_at")
