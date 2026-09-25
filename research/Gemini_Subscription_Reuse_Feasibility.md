# Jarvis Pet — Google/Gemini 기존 구독 재사용 타당성

- 조사 기준일: **2026-09-25**
- 판단 대상: 사용자가 이미 결제하는 **개인 Google AI Pro/Ultra**의 혜택을 **제3자 데스크톱 앱 Jarvis Pet**에서 추가 Gemini API 과금 없이 사용하는 방식
- 근거 범위: Google의 공식 문서·약관·공식 저장소 공지. 이 문서는 제품 설계 판단이며 개별 계약에 대한 법률 자문은 아니다.

## 결론

**현재 공식적으로 어려움.** 개인 Pro/Ultra 계정으로 **Google이 제공하는 Antigravity CLI 자체**를 사용하는 것은 가능하고, 해당 CLI는 프롬프트 입력과 기계가 읽을 수 있는 결과를 공식 지원한다. 그러나 Antigravity 추가 약관은 **Google이 제공하지 않는 제품과 연결해 서비스를 사용하거나 제3자 소프트웨어·도구·서비스로 Antigravity에 접근하는 행위**를 위반으로 명시한다. 공식 FAQ도 제3자 코딩 에이전트에 Antigravity 로그인을 쓰지 말고 Gemini Enterprise 또는 Google AI Studio API 키를 사용하라고 안내한다. 따라서 Jarvis Pet이 `agy`를 자식 프로세스로 실행해 구독 혜택을 제품 기능으로 제공하는 구조도 **허용된다고 판단할 근거가 없다**. 토큰을 직접 추출하지 않더라도 이 약관상 위험은 사라지지 않는다. [Antigravity 추가 약관 §6](https://antigravity.google/terms), [공식 FAQ](https://antigravity.google/docs/faq/)

판정은 두 층으로 나누어야 한다.

| 질문 | 판단 |
| --- | --- |
| 개인 사용자가 Google의 공식 CLI에 Pro/Ultra로 로그인하여 본인 작업에 쓰는가? | **가능**. 현재 개인 계정의 공식 터미널 경로는 Antigravity CLI다. |
| Jarvis Pet이 그 로그인·사용량을 재사용해 자체 대화 기능을 제공하는가? | **현재 공식적으로 어려움**. CLI의 자동화 인터페이스가 있어도 제3자 제품 접근에 대한 약관상 허가가 아니다. |
| Jarvis Pet이 공식 Gemini API 키로 연결하는가? | **가능**. 무료 할당량은 조건부로 무료이고, 유료 API 사용은 개인 AI Pro/Ultra 구독과 별도 과금 체계다. |

## 요청한 쟁점별 조사

### 1. 구독과 Gemini API 요금은 분리되어 있는가?

**예.** Gemini API의 무료/유료 등급은 Google Cloud 프로젝트와 연결된 결제 계정, 선불금·사용 이력으로 정해진다. Google AI Pro/Ultra 구독이 유료 API 호출권을 자동 부여한다는 공식 근거는 확인되지 않았다. API 키는 Cloud 프로젝트에 속하며, 유료 API는 Cloud Billing으로 결제된다. 반면 Pro/Ultra는 Antigravity 제품의 기본 사용량을 높이는 구독 혜택이다. 즉 **구독료를 냈어도 Jarvis Pet의 Gemini API 유료 호출은 별도 비용이 생길 수 있다**. [Gemini API 결제 문서](https://ai.google.dev/gemini-api/docs/billing), [Gemini API 추가 약관](https://ai.google.dev/gemini-api/terms), [API 키 문서](https://ai.google.dev/gemini-api/docs/api-key), [Antigravity 플랜](https://antigravity.google/docs/plans)

### 2. 현재 공식 CLI와 Google 계정 로그인

Google Gemini CLI 팀은 **2026-06-18부터 개인 무료·Google AI Pro·Ultra 계정의 Gemini CLI 요청 제공을 중단**하고 개인용 터미널 사용자를 **Antigravity CLI (`agy`)**로 이전한다고 공지했다. 기업용 Gemini Code Assist 라이선스와 API 키로 Gemini CLI를 쓰는 경로는 별개다. Antigravity CLI는 브라우저에서 개인 Google 계정으로 로그인하고, 이후 운영체제의 보안 저장소에 보관된 로그인 상태를 CLI 스스로 이용한다. Jarvis Pet이 그 저장소나 세션 토큰을 읽을 필요는 없다. 다만 **그렇게 토큰을 읽지 않는 것만으로 제3자 앱의 서비스 접근이 허용되는 것은 아니다**. [전환 공지](https://github.com/google-gemini/gemini-cli/discussions/28017), [Antigravity 설치·인증](https://antigravity.google/docs/cli/install/)

### 3. Jarvis Pet이 공식 CLI를 호출하여 프롬프트와 결과를 주고받을 수 있는가?

**기술적으로는 가능하다.** 공식 문서는 `agy -p "..." --output-format json` 실행, 표준 출력에서 응답 수집, 표준 오류에서 진단 수집, 표준 입력의 JSON 줄로 여러 프롬프트를 보내는 방식을 설명한다. 따라서 프로세스 연동 자체는 구현할 수 있다. **하지만 Jarvis Pet은 제3자 제품**이며, Google의 추가 약관 §6과 FAQ를 기준으로 보면 이 기술적 인터페이스를 Jarvis Pet의 구독 재사용 기능으로 제공해도 된다는 결론은 낼 수 없다. 공식 문서의 “스크립트·CI 연동” 설명은 자동 실행 기능의 존재를 보여줄 뿐 제3자 제품에 대한 별도 사용 허락으로 읽어서는 안 된다. 경계가 불명확한 예외가 필요하다면 Google의 명시적 서면 확인이 선행되어야 한다. [Headless 모드](https://antigravity.google/docs/cli/headless/), [추가 약관 §6](https://antigravity.google/terms), [공식 FAQ](https://antigravity.google/docs/faq/)

### 4. 비대화형 실행·구조화 출력·입출력·SDK

Antigravity CLI는 `-p`/`--print` 단발 비대화형 실행, `text`/`json`/`stream-json` 출력, `--json-schema` 구조화 결과, `--input-format stream-json`으로 **stdin** 다중 턴 입력 및 **stdout** 결과 이벤트를 지원한다. 인증은 먼저 대화형 실행에서 완료해야 하며, 로그인되지 않은 완전 무인 환경에서는 인증 필요 오류가 난다. CLI의 기본 응답 시간 제한은 5분이며 변경할 수 있다. Google의 **Antigravity Python SDK**도 있지만 공식 시작 안내는 **Gemini API 키** 또는 기업용 Google Cloud 경로를 설정한다. 개인 Pro/Ultra 로그인 혜택을 제3자 앱용 SDK 인증으로 제공한다고 설명하지 않는다. [Headless 모드](https://antigravity.google/docs/cli/headless/), [SDK 개요](https://antigravity.google/docs/sdk/overview/)

### 5. 로그인 세션·토큰 직접 추출 없이 가능한 공식 방법

Google이 제공하는 CLI를 사용자가 직접 실행할 때에는 CLI의 공식 브라우저 로그인과 운영체제 보안 저장소를 이용한다. Jarvis Pet용으로는 **Google AI Studio에서 만든 Gemini API 키를 사용자의 동의 아래 입력받아 공식 Gemini API를 호출**하는 경로가 문서화되어 있다. 이 키는 비밀 인증값이므로 안전하게 보관하고, 출력·기록·외부 전송에 노출하지 않아야 한다. Antigravity OAuth 토큰·세션 파일·내부 백엔드 주소·CLI의 비공개 요청 형식을 읽거나 복제하는 경로는 추천하지 않는다. [설치·인증](https://antigravity.google/docs/cli/install/), [FAQ](https://antigravity.google/docs/faq/), [API 키 문서](https://ai.google.dev/gemini-api/docs/api-key)

### 6. 사용자 승인·권한 모델

CLI의 에이전트 작업에는 **거부·질문·허용** 규칙이 있다. 비대화형 실행에서는 승인 창을 띄울 수 없어서 승인이 필요한 도구 작업을 거부하거나 미리 설정된 규칙을 적용한다. 전부 자동 승인하는 옵션도 있지만 파일 변경·명령 실행까지 허용하므로 Jarvis Pet의 기본값으로 적절하지 않다. 단순 채팅 MVP에서는 로컬 파일·명령 실행 권한을 제공하지 않는 설계가 적합하다. 별도로 **사용자가 API 키 연결과 보낼 프롬프트·자료를 명확히 승인**하도록 해야 한다. 이 제품 내 동의는 Google 약관의 제3자 접근 제한을 대신하지 않는다. [Headless 권한 설명](https://antigravity.google/docs/cli/headless/), [권한 문서](https://antigravity.google/docs/permissions?tab=cli), [추가 약관](https://antigravity.google/terms)

### 7. 플랜별 사용량 제한

Antigravity 공식 플랜 문서는 정확한 고정 프롬프트 수를 제시하지 않는다. **Ultra**는 가장 높은 기본·주간 한도와 5시간 단위 갱신, **Pro**는 높은 기본·주간 한도와 5시간 단위 갱신, 그 밖의 플랜은 주간 갱신 한도를 설명한다. 작업의 복잡도와 서비스 용량에 따라 실제 가능한 프롬프트 수가 달라지고 한도는 변경될 수 있다. **예전 Gemini CLI의 ‘Pro 1,500회/일, Ultra 2,000회/일’ 수치를 현행 개인 Antigravity CLI의 한도로 사용하면 안 된다.** API 무료 등급은 모델별·프로젝트별 분당 요청·토큰 및 일일 요청 제한이 별도 적용된다. [Antigravity 플랜](https://antigravity.google/docs/plans), [Gemini API 속도 제한](https://ai.google.dev/gemini-api/docs/rate-limits), [전환 공지](https://github.com/google-gemini/gemini-cli/discussions/28017)

### 8. macOS·Windows

Antigravity CLI는 **macOS, Windows, Linux**를 공식 지원한다. macOS와 Windows는 각각 공식 설치 절차가 있고, 로그인 상태는 macOS Keychain/Windows Credential Manager 등 운영체제 보안 저장소를 이용한다. 이는 CLI 자체의 지원 여부이며 **Jarvis Pet의 제3자 구독 연동 허가와는 별개**다. [설치·인증](https://antigravity.google/docs/cli/install/)

### 9. 추가 비용이 발생하는 조건

- **Antigravity 개인 구독 경로:** 기본 한도 안에서는 별도 API 청구가 아니라 구독 사용량을 소비한다. Pro/Ultra 사용자가 기본 한도를 넘고 **AI Credit Overages**를 ‘Always’로 설정하면 구매·프로모션 AI 크레딧을 추가 소비할 수 있다. 추가 비용을 원하지 않으면 ‘Never’ 설정이 필요하다. 다만 이 경로를 Jarvis Pet 기능으로 연결하는 것은 위 약관 문제 때문에 추천할 수 없다. [플랜](https://antigravity.google/docs/plans)
- **Gemini API 경로:** 지원되는 무료 등급 모델·한도 안에서는 추가 비용 없이 시험할 수 있다. 유료 등급 프로젝트에 결제를 연결하거나 선불금을 넣어 유료 호출하면 **Google AI Pro/Ultra와 별개로** 비용이 발생한다. 무료 모델·한도·데이터 처리 조건은 API 공식 문서에서 사용 시점에 다시 확인해야 한다. [API 결제](https://ai.google.dev/gemini-api/docs/billing), [API 속도 제한](https://ai.google.dev/gemini-api/docs/rate-limits), [API 추가 약관](https://ai.google.dev/gemini-api/terms)

### 10. OAuth/백엔드 재사용과 정상적 연동 범위

Antigravity 추가 약관 §6은 **제3자 소프트웨어·도구·서비스로 Antigravity에 접근하는 것**을 명시적으로 위반으로 규정하고, 미제공 제품과 결합한 사용도 제한한다. 공식 FAQ는 Antigravity 로그인을 제3자 코딩 에이전트에 쓰지 말라고 재확인한다. 따라서 토큰 직접 추출, 비공개 백엔드 호출, CLI OAuth를 다른 클라이언트에 이식하는 방식은 명확히 제외해야 한다. **공식 CLI 실행을 Jarvis Pet이 감싼 경우**는 토큰 추출보다 기술적으로 안전하지만, 제3자 제품이 서비스에 접근한다는 핵심 사실이 남는다. 공식 자료에서 이 구조를 명시적으로 허용한 예외는 확인하지 못했다. 정상적인 제품 연동 경로는 **공식 Gemini API/SDK와 별도 API 키**, 또는 자격과 계약을 갖춘 **Gemini Enterprise 경로**다. [추가 약관 §6](https://antigravity.google/terms), [공식 FAQ](https://antigravity.google/docs/faq/), [Antigravity SDK](https://antigravity.google/docs/sdk/overview/)

## Jarvis Pet 추천 연결 구조와 MVP

1. **제품에 ‘Google AI Pro/Ultra 구독 연결’ 버튼을 넣지 않는다.** 현재 근거로는 추가 API 과금 없는 공식 제3자 연동을 약속할 수 없다.
2. **MVP의 Gemini 연결은 공식 Gemini API 키**로 설계한다. 사용자가 키를 만들고 연결을 승인하면 Jarvis Pet이 공식 Gemini API에 요청한다. 무료 등급 사용 가능 여부와 유료 전환 가능성을 연결 화면에 분명히 표시한다. 유료 결제 연결은 사용자가 Google 쪽에서 직접 결정하게 한다.
3. 비용을 절대 늘리지 않으려는 사용자에게는 **API 무료 등급 한도 내 사용** 또는 **로컬 모델**을 제공하고, 한도에 닿으면 멈춰서 안내한다. API 무료 등급은 구독 혜택의 재사용이 아니라 별도 무료 제공이다.
4. Google이 Jarvis Pet 같은 제3자 데스크톱 앱의 **공식 CLI 실행 및 Pro/Ultra 구독 사용을 서면으로 허용**하거나 명시적 제품용 위임 인증 방식을 출시하면, 그때 CLI 어댑터를 재검토한다. 재검토 시에도 사용자 직접 로그인, 토큰 비접근, 좁은 권한, 비용 초과 방지, macOS/Windows 검증이 필요하다.

**MVP 현실성:** “Gemini 모델을 Jarvis Pet에 넣기”는 **가능**하다. “기존 Google AI Pro/Ultra 구독만으로, 별도 API 과금 없이, Jarvis Pet에서 공식적으로 사용하기”는 **현재 공식적으로 어려움**이다. 두 기능을 같은 약속으로 표현하면 사용자에게 비용과 약관 위험을 잘못 안내하게 된다.

## 검증 범위와 남은 확인 사항

- 공식 문서의 제품·요금·약관을 조사 기준일에 확인했다. **CLI 설치, 실제 계정 로그인, 모델 호출, macOS/Windows 실행 시험은 하지 않았다.** 따라서 특정 계정의 자격·사용량·지역·실제 동작을 검증한 결과는 아니다.
- 약관 문구는 광범위하다. 공식 CLI를 자식 프로세스로 쓰는 특정 제3자 앱에 대한 별도 예외가 있는지는 공개 문서에서 확인되지 않았다. 상용 출시 전에 Google의 명시적 확인이 필요하다.
- 공식 플랜의 한도와 API 무료 범위는 바뀔 수 있으므로 출시 직전 재확인해야 한다.

## 핵심 공식 자료

- [Google Antigravity 추가 이용약관](https://antigravity.google/terms)
- [Google Antigravity FAQ — 제3자 도구와 로그인](https://antigravity.google/docs/faq/)
- [Google Antigravity CLI — Headless 모드](https://antigravity.google/docs/cli/headless/)
- [Google Antigravity CLI — 설치와 인증](https://antigravity.google/docs/cli/install/)
- [Google Antigravity 플랜](https://antigravity.google/docs/plans)
- [Google Gemini CLI 팀의 개인 계정 전환 공지](https://github.com/google-gemini/gemini-cli/discussions/28017)
- [Gemini API 결제](https://ai.google.dev/gemini-api/docs/billing)
- [Gemini API 추가 이용약관](https://ai.google.dev/gemini-api/terms)
- [Gemini API 속도 제한](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Antigravity SDK 개요](https://antigravity.google/docs/sdk/overview/)
