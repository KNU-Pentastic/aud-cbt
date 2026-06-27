// 기본값은 운영 안전값: 실제 백엔드로 프록시하는 동일출처 BFF(/api/v1) + mock 비활성화.
// 빌드 시 NEXT_PUBLIC_* 가 누락돼도 깨진 mock 모드(/api/mock/v1 → 503)로 떨어지지 않는다.
// 주의: NEXT_PUBLIC_* 는 빌드 타임에 번들로 인라인되므로, 배포 환경에서는 반드시 빌드
// 전에 값을 설정하고 다시 빌드해야 한다(런타임 환경변수만으로는 적용되지 않음).
// mock 을 쓰려면 .env.local 에서 NEXT_PUBLIC_ENABLE_MOCKS=true 로 명시적으로 켠다.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"

export const ENABLE_MOCKS = process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true"
