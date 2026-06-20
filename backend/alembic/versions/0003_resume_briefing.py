"""conversation resume briefing fields (superseded by 0004)

NOTE: This approach (resume_briefing summary, "방안 2") was abandoned in favour of
surgically excluding only the crisis turn (messages.safety_excluded). This file is
kept ONLY so Alembic can locate the revision that some databases already recorded
in alembic_version; the columns it adds are dropped again by 0004. Fresh databases
add these columns here and immediately drop them in 0004 (harmless no-op churn).

Revision ID: 0003_resume_briefing
Revises: 0002_llm_unlock_audit
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_resume_briefing"
down_revision = "0002_llm_unlock_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("resume_briefing", sa.Text(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("resume_briefing_floor", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "resume_briefing_floor")
    op.drop_column("conversations", "resume_briefing")
