"""message safety_excluded flag; drop abandoned resume_briefing columns

Final design for the post-unlock resume problem: instead of summarising the
pre-lock context (resume_briefing, "방안 2"), we mark the single grade-A crisis
turn (messages.safety_excluded) and surgically exclude only that turn from the LLM
context (classifier / coach / stage tracker). Every other turn is kept verbatim, so
the conversation stays continuous after a provider unlock — no re-lock, no fixation,
no vanished history.

This migration:
  - drops the now-dead conversations.resume_briefing / resume_briefing_floor
    (added by 0003_resume_briefing). DROP ... IF EXISTS so it is safe whether or not
    that revision was actually applied to a given database.
  - adds messages.safety_excluded (bool, default false).

Revision ID: 0004_message_safety_excluded
Revises: 0003_resume_briefing
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_message_safety_excluded"
down_revision = "0003_resume_briefing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 방안 2(요약)에서 쓰던 죽은 컬럼 제거 — 적용 안 된 DB 에서도 안전하도록 IF EXISTS.
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS resume_briefing")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS resume_briefing_floor")
    # 채택된 방식: 위기(grade A) 발화 표시용 플래그.
    op.add_column(
        "messages",
        sa.Column(
            "safety_excluded",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "safety_excluded")
    op.add_column(
        "conversations",
        sa.Column("resume_briefing", sa.Text(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("resume_briefing_floor", sa.DateTime(timezone=True), nullable=True),
    )
