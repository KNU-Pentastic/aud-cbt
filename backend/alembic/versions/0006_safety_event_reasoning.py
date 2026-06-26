"""안전 이벤트 사유/근거 컬럼

의료진 웹에서 '왜 이 안전 알림이 떴는지'를 보여주기 위해 safety_events 에
사유(reasoning)·룰 매칭 키워드(matched_keyword)·원문 근거 구간(evidence_span)을
추가한다. (#3)

Revision ID: 0006_safety_event_reasoning
Revises: 0005_pii_encryption_access_log
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_safety_event_reasoning"
down_revision = "0005_pii_encryption_access_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("safety_events", sa.Column("reasoning", sa.String(length=1000), nullable=True))
    op.add_column(
        "safety_events", sa.Column("matched_keyword", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "safety_events", sa.Column("evidence_span", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("safety_events", "evidence_span")
    op.drop_column("safety_events", "matched_keyword")
    op.drop_column("safety_events", "reasoning")
