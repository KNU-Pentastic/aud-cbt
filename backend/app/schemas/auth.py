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


class PatientEmailRegisterIn(BaseModel):
    """이메일 회원가입 — 의료진 발급 등록 코드로 신원을 바인딩하고 이메일/비밀번호 설정."""

    registration_code: str = Field(pattern=REG_CODE)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class PatientEmailLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
