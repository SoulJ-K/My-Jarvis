# Jarvis Pet — OpenAI 구독 재사용 타당성 조사 (1/3)

**조사일: 2026-09-25**  
**핵심 질문:** 사용자가 이미 결제 중인 ChatGPT 구독을 추가 OpenAI API 과금 없이 제3자 데스크톱 앱 Jarvis Pet에서 공식적으로 재사용할 수 있는가?

## 결론: 부분적으로 가능

**가능한 범위:** 사용자가 자신의 ChatGPT 계정으로 공식 Codex에 로그인하고, Jarvis Pet이 로컬의 공식 `codex exec`, Codex SDK, 또는 Codex App Server를 호출하는 구조는 OpenAI가 문서화한 방식이다. 이 경우 Codex 작업은 사용자의 ChatGPT 플랜에 포함된 **Codex 사용량**을 쓴다. 공식 문서는 Codex SDK를 자체 애플리케이션에 통합할 수 있다고 명시하고, App Server를 자체 제품의 인증·대화 기록·승인·이벤트 처리용 인터페이스로 설명한다. [Codex 인증](https://learn.chatgpt.com/docs/auth), [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [Codex App Server](https://learn.chatgpt.com/docs/app-server)

**한계:** 이 경로는 ChatGPT 구독을 임의의 OpenAI API 호출에 쓸 수 있게 해 주는 범용 API 권한이 아니다. Codex는 개발·작업 에이전트이며, Jarvis Pet의 상시 대화, 음성 비서, 대량 자동 응답 등 모든 용도를 구독 사용량으로 제공해도 된다는 별도 보증을 공식 문서에서 확인하지 못했다. 사용량 한도가 있으며 초과분을 유료 크레딧으로 확장하거나 API 키로 전환하면 비용이 생긴다. 공개 판매용 범용 래퍼 앱의 구체적 허용 범위도 공식 자료만으로 단정하기 어렵다. **MVP는 사용자가 명시적으로 시작하는 로컬 작업 보조 기능으로 한정**하는 것이 현실적이다. [Codex CLI 소개](https://learn.chatgpt.com/docs/codex/cli), [Codex 요금·한도](https://learn.chatgpt.com/docs/pricing), [OpenAI 이용약관](https://openai.com/policies/row-terms-of-use/)

## 항목별 확인

| 항목 | 확인 결과 | 판단 |
|---|---|---|
| 1. ChatGPT 구독과 API 과금 | 별도의 결제 체계다. ChatGPT Business 구독에도 API 사용량은 포함되지 않는다. | **분리** |
| 2. ChatGPT 로그인으로 Codex 사용 | 데스크톱 앱, CLI, IDE 확장 프로그램은 ChatGPT 로그인 지원. 로그인한 Codex는 해당 ChatGPT 플랜의 사용량·과금을 따른다. | **가능** |
| 3. 제3자 데스크톱 앱에서 작업·결과 주고받기 | 공식 SDK는 자체 앱 통합을 명시한다. App Server는 자체 제품용 인터페이스이고, CLI `exec`는 명령 실행 결과를 표준 출력으로 제공한다. | **가능하나 용도·약관 확인 필요** |
| 4. 비대화형 실행·구조화 출력 | `codex exec`, 표준 입력의 프롬프트, 표준 출력의 최종 메시지, JSONL 이벤트, JSON Schema 기반 최종 출력, SDK 및 App Server 지원. | **가능** |
| 5. 토큰 추출 없는 로그인 | 사용자 브라우저 로그인 또는 기기 코드 로그인 절차를 Codex가 직접 관리하고 토큰을 갱신한다. 앱이 `auth.json`을 읽거나 토큰을 가져갈 필요가 없다. | **가능** |
| 6. 사용자 승인·권한 | Codex의 작업 공간 제한, 네트워크 권한, 승인 정책 적용. App Server는 승인 요청·결정 메시지를 제공한다. Jarvis Pet은 그 요청을 사용자에게 보여주고 결정을 전달해야 한다. | **구현 필요** |
| 7. 플랜별 한도 | Plus·Pro·Business 등은 포함 사용량과 한도가 다르다. 작업 크기·모델·실행 방식에 따라 소모량이 변한다. | **무제한 아님** |
| 8. macOS·Windows | 공식 ChatGPT 데스크톱 앱과 Codex CLI 문서에 두 운영체제가 제시된다. | **지원** |
| 9. 추가 비용 조건 | API 키 인증은 API 요금. 포함 한도 초과 후 유료 ChatGPT 크레딧을 사용하거나 Business 작업 공간 크레딧을 쓰면 비용 가능. | **설정에 따라 발생** |
| 10. 제3자 래퍼 앱 약관 | 공식 클라이언트 인터페이스는 있으나 계정 공유·한도 우회·서비스 재판매·비공식 출력 수집에 주의. 범용 상업 래퍼에 대한 포괄적 허가는 확인되지 않았다. | **조건부·추가 확인 필요** |

### 1) 구독과 API 결제의 경계

OpenAI 도움말은 ChatGPT와 API 플랫폼의 결제가 분리되어 있고, API 사용은 구독과 별도로 청구된다고 명시한다. Business FAQ도 Business 구독에 API 사용량이 포함되지 않는다고 확인한다. 따라서 **Jarvis Pet이 OpenAI Responses API 등에 사용자의 ChatGPT Plus/Pro/Business 로그인만 붙여 호출하는 방식은 성립하지 않는다.** [결제 도움말](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform), [Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq)

### 2–3) 공식 Codex 클라이언트 경유 연결

OpenAI 인증 문서는 ChatGPT 계정 로그인을 구독 이용 방식, API 키 로그인을 사용량 기반 방식으로 구분한다. Codex CLI에서는 사용자가 `codex login` 후 브라우저 로그인 절차를 완료한다. Codex SDK 문서는 자체 애플리케이션에 Codex를 통합할 수 있다고 명시한다. TypeScript SDK는 로컬 Codex 대화를 시작·이어가기·재개하기를 지원하고, Python SDK는 로컬 App Server와 통신한다. App Server 문서는 자체 제품의 클라이언트를 만들며 인증, 대화 기록, 승인, 실시간 이벤트를 처리하는 용도를 명시한다. 이는 **Jarvis Pet → 공식 Codex 클라이언트 → 사용자 ChatGPT 계정** 경로의 직접 근거다. [인증](https://learn.chatgpt.com/docs/auth), [SDK](https://learn.chatgpt.com/docs/codex-sdk), [App Server](https://learn.chatgpt.com/docs/app-server)

단, 공식 문서의 중심 사용 사례는 코딩과 로컬 작업 자동화다. 이를 일반 소비자 챗봇 서비스 전체에 적용해도 되는지, 또는 구독 한도를 이용해 타인에게 모델 접근권을 재판매할 수 있는지는 위 인터페이스 문서가 보증하지 않는다. 이 부분은 **공식 문서의 명시적 허용이 아니라 제품 범위에 대한 추론**이다. [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [이용약관](https://openai.com/policies/row-terms-of-use/)

### 4) 자동화·입출력·구조화 결과

`codex exec`는 화면 대화 없이 스크립트에서 실행된다. 기본적으로 진행 정보는 표준 오류 출력, 최종 답변은 표준 출력으로 나간다. 프롬프트 문자열 또는 `-`로 표준 입력을 사용할 수 있다. `--json`은 JSON Lines 형식의 이벤트 흐름을 내보내고, `--output-schema`는 JSON Schema에 맞춘 최종 응답을 요청한다. App Server의 기본 전송 방식은 표준 입출력의 줄 단위 JSON이며, 요청과 알림으로 작업 결과를 받을 수 있다. JSON 출력은 **구조화된 작업 결과**이지 임의의 OpenAI API 엔드포인트 권한은 아니다. [비대화형 모드](https://learn.chatgpt.com/docs/non-interactive-mode), [CLI 명령 참조](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [App Server](https://learn.chatgpt.com/docs/app-server)

### 5–6) 로그인 정보와 승인 모델

App Server의 `chatgpt` 인증 방식은 Codex가 브라우저 로그인 절차, 토큰 저장 및 갱신을 관리한다. 기기 코드 로그인도 지원한다. Jarvis Pet은 사용자를 공식 로그인 화면으로 안내하고 로그인 완료 상태만 확인하는 구조가 적절하다. `~/.codex/auth.json`을 직접 읽거나 복사하지 않는다. OpenAI 문서는 이 파일을 비밀번호처럼 취급하라고 경고한다. App Server의 외부 토큰 주입 방식은 실험적이며, 이미 자체 인증 생명주기를 소유한 호스트용이므로 MVP에는 맞지 않는다. [App Server 인증 방식](https://learn.chatgpt.com/docs/app-server), [Codex 인증·자격 증명 저장](https://learn.chatgpt.com/docs/auth), [비대화형 인증](https://learn.chatgpt.com/docs/non-interactive-mode)

Codex의 보호 장치는 **샌드박스**(작업이 닿을 수 있는 파일·네트워크 범위)와 **승인 정책**(사용자에게 멈춰 물어볼 조건)이다. `codex exec`는 기본적으로 읽기 전용 실행이고, 쓰기가 필요할 때만 작업 공간 쓰기 권한을 지정할 수 있다. App Server는 명령 실행 등에 대한 승인 요청과 승인·거절 응답을 지원한다. Jarvis Pet은 승인 요청의 실제 명령과 대상 경로를 표시하고, 사용자의 결정을 그대로 전달하며, 거절 시 작업을 중지해야 한다. [비대화형 권한](https://learn.chatgpt.com/docs/non-interactive-mode), [승인·보안](https://learn.chatgpt.com/docs/agent-approvals-security), [App Server 승인 프로토콜](https://learn.chatgpt.com/docs/app-server)

### 7–9) 한도, 운영체제, 비용

Codex는 Plus·Pro·Business·Enterprise 등 ChatGPT 플랜에 포함되지만 사용량은 플랜, 모델, 작업 복잡도, 로컬/클라우드 실행에 따라 달라진다. 공식 요금 문서는 Pro의 Codex 사용량이 Plus보다 높으며, Business의 좌석 종류에 따라 포함량이 다르다고 설명한다. 로컬 작업과 클라우드 작업은 플랜 사용량을 공유하고 주간 한도가 추가될 수 있다. 실제 남은 한도와 재설정 시점은 계정의 사용량 화면에서 확인해야 한다. App Server에는 `account/rateLimits/read`라는 공식 조회 메서드도 있다. 고정된 '월 N회 무료'로 홍보하면 부정확하다. [Codex 요금·한도](https://learn.chatgpt.com/docs/pricing), [Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq), [App Server 사용량 조회](https://learn.chatgpt.com/docs/app-server)

Codex CLI와 ChatGPT 데스크톱 앱은 macOS·Windows를 공식 문서에서 지원한다. 제품별 설치·샌드박스 구현은 다르므로 Jarvis Pet은 두 운영체제에서 각각 시험해야 한다. [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [ChatGPT 데스크톱 앱](https://learn.chatgpt.com/docs/app)

**추가 비용이 생기는 경우:** (a) OpenAI API 키 방식 선택, (b) 포함 한도 초과 후 ChatGPT 유료 크레딧 구매·사용, (c) Business 작업 공간에서 허용된 유연 요금제 크레딧 소모. Jarvis Pet이 API 키를 몰래 대체 인증으로 쓰거나, 자동 충전을 켜거나, 유료 크레딧 구매를 대신해서는 안 된다. 한도 도달 시 작업을 멈추고 사용자가 자신의 OpenAI 화면에서 선택하게 하는 설계가 적절하다. [Codex 인증](https://learn.chatgpt.com/docs/auth), [개인 플랜 크레딧 도움말](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-freegopluspro-sora), [Business FAQ](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq)

### 10) 제3자 앱의 약관·정책 주의점

개인용 이용약관은 계정 자격 증명 공유, 서비스 판매·배포, 제한 우회, 서비스에서 출력물을 자동·프로그램 방식으로 추출하는 행위를 제한한다. 동시에 OpenAI는 Codex SDK와 `codex exec`를 공식 자동화 수단으로 문서화한다. **합리적인 해석은 '공식 Codex 인터페이스로 해당 사용자의 작업을 수행하는 용도'와 '비공식 ChatGPT 웹 화면 수집, 세션 추출, 타인에게 계정 접근권 제공'을 구별해야 한다는 것**이다. 이는 약관 해석에 관한 추론이며 법적 확답이 아니다. 상업 배포 전에 범용 대화·대량 자동화·유료 래퍼 기능의 범위는 OpenAI에 서면 확인을 받는 편이 안전하다. [개인용 이용약관](https://openai.com/policies/row-terms-of-use/), [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [비대화형 모드](https://learn.chatgpt.com/docs/non-interactive-mode)

특히 Jarvis Pet이 OpenAI 공식 제품인 것처럼 보이게 하지 말고, 사용자가 자신의 계정으로 로그인하며 자신의 플랜 한도를 소비한다는 점을 분명히 표시해야 한다. 계정·대화·파일을 Jarvis Pet 서버로 전송할 경우 별도의 개인정보 고지와 사용자의 선택이 필요하다. Business·Enterprise에서는 작업 공간 권한과 관리자 정책이 추가로 적용된다. [Codex 인증과 작업 공간 정책](https://learn.chatgpt.com/docs/auth), [개인용 이용약관](https://openai.com/policies/row-terms-of-use/)

## Jarvis Pet 권장 연결 구조

1. **사용자 소유 로컬 실행:** Jarvis Pet이 사용자의 컴퓨터에 설치된 공식 Codex CLI 또는 Codex SDK/App Server에 연결한다. Jarvis Pet 서버에서 여러 사용자의 ChatGPT 세션을 모아 중계하지 않는다.
2. **공식 로그인:** 사용자가 `codex login` 또는 App Server의 `account/login/start(type: "chatgpt")`로 직접 로그인한다. Jarvis Pet은 로그인 상태·플랜만 표시하고 인증 토큰은 열람·저장하지 않는다.
3. **명시적 작업:** 사용자가 '이 폴더의 코드 설명', '파일 수정 제안'처럼 구체적 작업을 시작한다. 프롬프트와 결과는 SDK/App Server로 주고받는다. 간단한 초기 버전은 `codex exec`로도 충분하다.
4. **권한·비용 제어:** 기본 읽기 전용, 필요 시 선택 폴더 쓰기 권한. 승인 요청은 사용자에게 노출한다. 사용량을 표시하고 한도에 도달하면 중지한다. API 키와 유료 크레딧으로 자동 전환하지 않는다.
5. **정식 제품 단계:** 대화 이어가기, 세밀한 승인 화면, 진행 이벤트가 필요하면 App Server로 확장한다. App Server 명령과 WebSocket 전송은 문서상 실험적 범위가 있으므로 제품 버전 고정·호환성 시험이 필요하다. 로컬 표준 입출력 연결을 우선 고려한다.

## MVP 현실성 및 남은 검증

**현실적인 MVP:** macOS와 Windows의 사용자 로컬에서, 사용자가 직접 누르는 작업 버튼 → ChatGPT 로그인된 Codex → 최종 텍스트/JSON 결과 표시. 코드·파일 작업 보조로 한정하면 공식 문서와 잘 맞는다. 음성 입력·캐릭터 UI 자체는 Jarvis Pet이 담당할 수 있지만, 상시 음성 응답이나 범용 챗봇을 Codex 구독 한도로 제공하는 제품 약속은 이 조사만으로 뒷받침되지 않는다.

**출시 전 확인할 것:** (1) 실제 설치 버전에서 ChatGPT 로그인으로 SDK/App Server/CLI 작업 성공 여부, (2) macOS·Windows의 로그인·권한·출력 형식·한도 도달 동작, (3) 배포하려는 Jarvis Pet 기능 범위에 대한 OpenAI의 약관 해석. 이번 조사는 **공식 문서 조사**이며, Jarvis Pet 시제품 연동 실행이나 약관에 대한 OpenAI의 개별 답변까지 확인한 것은 아니다.
