from pydantic import BaseModel, EmailStr, Field


REG_CODE = r"^[A-Z0-9]{8}$"
PIN = r"^[0-9]{6}$"
TOTP = r"^[0-9]{6}$"


class PatientRegisterIn(BaseModel):
    registration_code: str = Field(pattern=REG_CODE)
    pin: str = Field(pattern=PIN)


class PatientLoginIn(BaseModel):
    registration_code: str = Field(pattern=REG_CODE)
    pin: str = Field(pattern=PIN)


class ProviderLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)
    totp: str = Field(pattern=TOTP)


class PinChangeIn(BaseModel):
    current_pin: str = Field(pattern=PIN)
    new_pin: str = Field(pattern=PIN)
