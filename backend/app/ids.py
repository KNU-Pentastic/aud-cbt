import secrets
import string


_ALPHABET = string.ascii_lowercase + string.digits
_REGCODE_ALPHABET = string.ascii_uppercase + string.digits


def _rand(n: int, alphabet: str = _ALPHABET) -> str:
    return "".join(secrets.choice(alphabet) for _ in range(n))


def new_id(prefix: str, length: int = 10) -> str:
    return f"{prefix}_{_rand(length)}"


def patient_id() -> str:
    return new_id("p", 10)


def provider_id() -> str:
    return new_id("pr", 10)


def session_id() -> str:
    return new_id("s", 10)


def conversation_id() -> str:
    return new_id("c", 10)


def message_id() -> str:
    return new_id("m", 10)


def safety_event_id() -> str:
    return new_id("se", 10)


def checkin_id() -> str:
    return new_id("ci", 10)


def sso_id() -> str:
    return new_id("sso", 10)


def discharge_profile_id() -> str:
    return new_id("dp", 10)


def session_summary_id() -> str:
    return new_id("ss", 10)


def medication_log_id() -> str:
    return new_id("ml", 10)


def p4_event_id() -> str:
    return new_id("p4", 10)


def conversation_log_id() -> str:
    return new_id("cl", 10)


def llm_invocation_id() -> str:
    return new_id("inv", 12)


def access_log_id() -> str:
    return new_id("al", 12)


def registration_code() -> str:
    """8-character uppercase alphanumeric. Excludes 0, O, 1, I to avoid OCR confusion."""
    excluded = {"0", "O", "1", "I"}
    alphabet = "".join(c for c in _REGCODE_ALPHABET if c not in excluded)
    return _rand(8, alphabet)
