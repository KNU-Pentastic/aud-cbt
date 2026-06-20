from pydantic import BaseModel, EmailStr, Field


REG_CODE = r"^[A-Z0-9]{8}$"
PIN = r"^[0-9]{6}$"


class PatientRegisterIn(BaseModel):
    registration_code: str = Field(pattern=REG_CODE)
    pin: str = Field(pattern=PIN)


class PatientLoginIn(BaseModel):
    registration_code: str = Field(pattern=REG_CODE)
    pin: str = Field(pattern=PIN)


class ProviderLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)


class PinChangeIn(BaseModel):
    current_pin: str = Field(pattern=PIN)
    new_pin: str = Field(pattern=PIN)


class PatientOAuthGoogleIn(BaseModel):
    """구글 OAuth 2.1 로그인/연동.

    id_token: 환자앱이 구글에서 PKCE 로 받은 OpenID Connect id_token.
    registration_code: 최초 연동 시 의료진이 발급한 코드로 환자 신원을 바인딩한다.
        이미 google_sub 로 연동된 환자는 코드 없이 로그인된다.
    """

    id_token: str = Field(min_length=1)
    registration_code: str | None = Field(default=None, pattern=REG_CODE)


class PatientEmailRegisterIn(BaseModel):
    """이메일 회원가입 — 의료진 발급 등록 코드로 신원을 바인딩하고 이메일/비밀번호 설정."""

    registration_code: str = Field(pattern=REG_CODE)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class PatientEmailLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
