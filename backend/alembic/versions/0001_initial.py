"""initial schema (v3.0)

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "providers",
        sa.Column("provider_id", sa.String(40), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("totp_secret", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("affiliation", sa.String(255), nullable=False, server_default=""),
        sa.Column("notification_preferences", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_providers_email", "providers", ["email"], unique=True)

    op.create_table(
        "patients",
        sa.Column("patient_id", sa.String(40), primary_key=True),
        sa.Column("provider_id", sa.String(40), sa.ForeignKey("providers.provider_id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False),
        sa.Column("date_of_birth", sa.Date, nullable=False),
        sa.Column("sex", sa.String(16), nullable=False),
        sa.Column("pin_hash", sa.String(255), nullable=True),
        sa.Column("is_registered", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("discharge_date", sa.Date, nullable=False),
        sa.Column("next_outpatient_date", sa.Date, nullable=True),
        sa.Column("program_status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("current_week", sa.Integer, nullable=False, server_default="1"),
        sa.Column("current_phase", sa.Integer, nullable=False, server_default="1"),
        sa.Column("daily_checkin_time", sa.String(5), nullable=False, server_default="20:00"),
        sa.Column("session_day_of_week", sa.Integer, nullable=False, server_default="0"),
        sa.Column("llm_locked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("llm_locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("llm_lock_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_patients_provider_id", "patients", ["provider_id"])

    op.create_table(
        "discharge_profiles",
        sa.Column("discharge_profile_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False, unique=True),
        sa.Column("diagnosis_severity", sa.String(20), nullable=False),
        sa.Column("admission_days", sa.Integer, nullable=False),
        sa.Column("suicide_ideation_history", sa.String(32), nullable=False),
        sa.Column("medications", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("comorbidities", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("primary_triggers_raw", sa.String(2000), nullable=False),
        sa.Column("normalized_triggers", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_discharge_profiles_patient_id", "discharge_profiles", ["patient_id"], unique=True)

    op.create_table(
        "support_persons",
        sa.Column("sso_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("relationship_type", sa.String(32), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False),
        sa.Column("access_level", sa.String(32), nullable=False, server_default="info_only"),
    )

    op.create_table(
        "daily_checkins",
        sa.Column("checkin_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("mood_nrs", sa.Integer, nullable=False),
        sa.Column("craving_nrs", sa.Integer, nullable=False),
        sa.Column("sleep_hours", sa.Float, nullable=False),
        sa.Column("medication_records", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("free_note", sa.String(2000), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("patient_id", "date", name="uq_checkin_patient_date"),
    )
    op.create_index("ix_daily_checkins_patient_id", "daily_checkins", ["patient_id"])
    op.create_index("ix_daily_checkins_date", "daily_checkins", ["date"])

    op.create_table(
        "p4_events",
        sa.Column("p4_event_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("trigger", sa.String(32), nullable=False),
        sa.Column("related_safety_event_id", sa.String(40), nullable=True),
        sa.Column("clicked_resource", sa.String(16), nullable=True),
        sa.Column("shown_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_p4_events_patient_id", "p4_events", ["patient_id"])

    op.create_table(
        "medication_logs",
        sa.Column("medication_log_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("checkin_id", sa.String(40), nullable=True),
        sa.Column("medication_name", sa.String(120), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("taken", sa.Boolean, nullable=False),
        sa.Column("side_effect_note", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_medication_logs_patient_id", "medication_logs", ["patient_id"])
    op.create_index("ix_medication_logs_date", "medication_logs", ["date"])
    op.create_index("ix_medication_logs_checkin_id", "medication_logs", ["checkin_id"])

    op.create_table(
        "sessions",
        sa.Column("session_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("phase", sa.Integer, nullable=False, server_default="1"),
        sa.Column("current_step", sa.Integer, nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="in_progress"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(40), nullable=True),
    )
    op.create_index("ix_sessions_patient_id", "sessions", ["patient_id"])

    op.create_table(
        "session_summaries",
        sa.Column("session_summary_id", sa.String(40), primary_key=True),
        sa.Column("session_id", sa.String(40), sa.ForeignKey("sessions.session_id"), nullable=False, unique=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("completed_objectives", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("unaddressed_objectives", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("key_insights", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("identified_triggers", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("assigned_homework", sa.String(2000), nullable=False, server_default=""),
        sa.Column("emotional_tone", sa.String(40), nullable=False, server_default="neutral"),
        sa.Column("handoff_notes", sa.String(4000), nullable=False, server_default=""),
        sa.Column("safety_flags", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("model_used", sa.String(64), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("generation_time_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_session_summaries_patient_id", "session_summaries", ["patient_id"])

    op.create_table(
        "conversations",
        sa.Column("conversation_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("context", sa.String(16), nullable=False),
        sa.Column("session_id", sa.String(40), sa.ForeignKey("sessions.session_id"), nullable=True),
        sa.Column("week_number", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(40), nullable=True),
    )
    op.create_index("ix_conversations_patient_id", "conversations", ["patient_id"])
    op.create_index("ix_conversations_context", "conversations", ["context"])

    op.create_table(
        "messages",
        sa.Column("message_id", sa.String(40), primary_key=True),
        sa.Column("conversation_id", sa.String(40), sa.ForeignKey("conversations.conversation_id"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])

    op.create_table(
        "safety_events",
        sa.Column("safety_event_id", sa.String(40), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("grade", sa.String(2), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("recommended_action", sa.String(40), nullable=False),
        sa.Column("matched_by", sa.String(20), nullable=False, server_default="none"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="0"),
        sa.Column("raw_text", sa.String(4000), nullable=True),
        sa.Column("conversation_id", sa.String(40), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_safety_events_patient_id", "safety_events", ["patient_id"])

    op.create_table(
        "llm_usage",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("patient_id", sa.String(40), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("used_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("breakdown_by_model", sa.JSON, nullable=False, server_default="{}"),
        sa.UniqueConstraint("patient_id", "date", name="uq_usage_patient_date"),
    )
    op.create_index("ix_llm_usage_patient_id", "llm_usage", ["patient_id"])
    op.create_index("ix_llm_usage_date", "llm_usage", ["date"])

    op.create_table(
        "registration_codes",
        sa.Column("code", sa.String(8), primary_key=True),
        sa.Column("patient_id", sa.String(40), sa.ForeignKey("patients.patient_id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_registration_codes_patient_id", "registration_codes", ["patient_id"])


def downgrade() -> None:
    for tbl in [
        "registration_codes",
        "llm_usage",
        "safety_events",
        "messages",
        "conversations",
        "session_summaries",
        "sessions",
        "medication_logs",
        "p4_events",
        "daily_checkins",
        "support_persons",
        "discharge_profiles",
        "patients",
        "providers",
    ]:
        op.drop_table(tbl)
