from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

ApiModel = ConfigDict(from_attributes=True, populate_by_name=True)

T = TypeVar("T")

NRSScore = Annotated[int, Field(ge=0, le=10)]
SafetyGrade = Literal["A", "B"]
SafetyGradeOrNone = Literal["A", "B", "none"]
SafetyEventType = Literal[
    "suicide_risk", "acute_intoxication", "relapse", "medication_stop", "paws"
]
SafetyEventTypeOrNone = Literal[
    "suicide_risk", "acute_intoxication", "relapse", "medication_stop", "paws", "none"
]
ConversationContextLit = Literal["session", "craving", "resu", "soma"]
RecommendedAction = Literal["llm_lock_p4", "switch_resu", "switch_soma", "paws_resource", "none"]


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PaginatedEnvelope(BaseModel, Generic[T]):
    items: list[T]
    pagination: Pagination


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
