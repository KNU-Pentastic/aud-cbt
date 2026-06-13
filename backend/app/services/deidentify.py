"""LLM 전송 전 발화 가명처리(de-identification).

환자 발화는 건강정보(민감정보)이고 Anthropic API 로 보내는 것은 국외이전에 해당한다.
개인정보보호법상 노출 위험이 큰 정형 식별자(주민등록번호·전화·이메일·카드/계좌번호)는
모델 추론에 불필요하므로, 게이트웨이에서 외부로 나가기 직전에 마스킹한다.

DB 에 저장되는 원문에는 영향을 주지 않는다 — 외부로 나가는 사본만 가린다.
임상 위험 신호(자살·중독 등 자연어)는 가리지 않으므로 안전 분류 정확도에 영향이 없다.
"""

from __future__ import annotations

import re

# 주민등록번호: 6자리-7자리 (구분자 유무 모두)
_RRN = re.compile(r"\b\d{6}[- ]?\d{7}\b")
# 휴대폰/전화: 010-1234-5678, +82 10 1234 5678 등
_PHONE = re.compile(r"(?<!\d)(?:\+?82[- ]?)?0?1[0-9][- ]?\d{3,4}[- ]?\d{4}(?!\d)")
_PHONE_GENERAL = re.compile(r"(?<!\d)0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}(?!\d)")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
# 카드/계좌 등 12자리 이상 숫자 덩어리(구분자 허용)
_LONG_NUMBER = re.compile(r"(?<!\d)(?:\d[- ]?){12,}\d(?!\d)")

_MASKS = (
    (_RRN, "[주민번호]"),
    (_EMAIL, "[이메일]"),
    (_PHONE, "[전화번호]"),
    (_PHONE_GENERAL, "[전화번호]"),
    (_LONG_NUMBER, "[번호]"),
)


def mask_text(text: str) -> str:
    if not text:
        return text
    out = text
    for pattern, repl in _MASKS:
        out = pattern.sub(repl, out)
    return out


def mask_messages(messages: list[dict]) -> list[dict]:
    """messages 사본을 반환한다(원본 불변). content 가 문자열/블록 리스트 모두 지원."""
    masked: list[dict] = []
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            new_content: object = mask_text(content)
        elif isinstance(content, list):
            new_content = [
                {**b, "text": mask_text(b["text"])}
                if isinstance(b, dict) and isinstance(b.get("text"), str)
                else b
                for b in content
            ]
        else:
            new_content = content
        masked.append({**m, "content": new_content})
    return masked
