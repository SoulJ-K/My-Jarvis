# Jarvis Pet 연동 타당성 조사 2/3 — Anthropic Claude 구독 재사용

- 조사일: **2026-09-25**
- 범위: 개인용 Claude Pro/Max 구독을 Jarvis Pet이라는 제3자 데스크톱 앱에서 추가 API 과금 없이 쓰는 방안. Team/Enterprise는 관련 정책 확인에만 참고했습니다.
- 판정: **현재 공식적으로 어려움**. 사용자가 Anthropic의 Claude Code를 Pro/Max 계정으로 쓰는 것은 가능하지만, Jarvis Pet이 그 구독 사용량을 자기 제품의 대화 기능에 연결해 제공하는 것은 별도 문제입니다. [Claude Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview)는 사전 승인 없이 제3자 개발자가 자기 제품에 claude.ai 로그인이나 구독 사용량을 제공하는 것을 허용하지 않는다고 명시합니다. [Claude 계정 로그인 안내](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)도 제3자 제품 개발자에게 Console API 키 또는 지원되는 클라우드 제공업체 인증을 안내합니다.

## 핵심 구분

**기술적 가능성과 제품에 허용된 방식은 다릅니다.** Claude Code는 프롬프트를 자동 실행하고 결과를 기계가 읽을 수 있는 형태로 돌려주는 공식 도구입니다. 그러나 그 인터페이스가 존재한다는 사실만으로 Jarvis Pet이 사용자의 구독 한도를 자기 앱으로 가져와도 된다는 권한이 생기지는 않습니다. 특히 Claude Code를 하위 프로세스로 실행하는 방식도 제3자 제품이 구독 한도를 제공하는 효과가 같다면 정책 검토 대상입니다. 이 마지막 문장은 [Agent SDK의 제3자 개발자 제한](https://code.claude.com/docs/en/agent-sdk/overview)과 [로그인 안내의 제3자 트래픽 제한](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)을 Jarvis Pet 구조에 적용한 **해석**입니다.

## 요청 항목별 확인

| 항목 | 공식 문서에서 확인한 사실 | Jarvis Pet에 대한 판단 |
| --- | --- | --- |
| 1. 구독과 API 과금 | Pro/Max 구독에 일반 Claude API/Console 사용권은 포함되지 않습니다. Console API는 별도 결제 체계입니다. [구독과 API 과금 안내](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console) | 일반 Messages API를 구독 요금으로 호출할 수 없습니다. |
| 2. Claude Code 로그인 | 개인 Pro/Max 사용자는 Claude Code 설치 후 같은 Claude 계정으로 로그인할 수 있습니다. Claude와 Claude Code가 구독 사용량을 공유합니다. [Pro/Max에서 Claude Code 사용](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan) | **사용자 본인의 Anthropic 도구 사용**은 가능합니다. 이것이 Jarvis Pet의 제3자 로그인 허가를 뜻하지는 않습니다. |
| 3. 공식 클라이언트 호출 | Claude Code의 `claude -p`는 비대화형 호출을 지원합니다. Agent SDK는 Python/TypeScript에서 같은 실행기를 감쌀 수 있고, 다른 언어도 CLI를 하위 프로세스로 실행할 수 있다고 안내합니다. [자동 실행](https://code.claude.com/docs/en/headless), [Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview) | 구현 수단은 있습니다. 다만 사전 승인 없는 Jarvis Pet 제품이 **구독 로그인·구독 한도**를 제공하는 용도로 쓰는 것은 공식 문서상 허용되지 않습니다. |
| 4. 자동화·입출력·구조화 출력 | `claude -p`는 stdin을 읽고 stdout으로 답을 출력합니다. `--output-format json`은 결과와 세션 정보를, `stream-json`은 줄 단위 스트림을 제공합니다. `--json-schema`는 지정된 구조의 출력에 사용하며 `--input-format stream-json`도 있습니다. [자동 실행](https://code.claude.com/docs/en/headless), [CLI 옵션](https://code.claude.com/docs/en/cli-reference) | 승인된 사용 사례나 별도 API 결제 경로에는 충분한 인터페이스입니다. 기능 제공과 구독 재사용 허가는 분리해야 합니다. |
| 5. 토큰 추출 없는 인증 | Claude Code는 자체 로그인 절차로 구독 계정을 연결합니다. 제3자 제품을 위한 공식 권장 방식은 Console API 키 또는 지원 클라우드 인증입니다. [Pro/Max 로그인](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan), [제3자 개발자 안내](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) | Jarvis Pet이 Claude Code 세션 파일·OAuth 토큰·쿠키를 읽거나 복사하는 방식은 채택하지 않습니다. 사용자 구독을 Jarvis Pet에 허용하는 공개적인 일반 OAuth 연결 절차도 확인하지 못했습니다. |
| 6. 사용자 승인·도구 권한 | Claude Code는 읽기, 명령 실행, 파일 수정, 웹 접근 등 도구별 승인 체계를 갖습니다. 기본 모드에서는 위험한 작업에 승인을 요청합니다. `--allowedTools`는 특정 도구를 자동 승인하고, `--tools`는 사용 가능한 내장 도구를 제한합니다. Agent SDK에는 `canUseTool` 승인 콜백이 있습니다. [권한 설정](https://code.claude.com/docs/en/permissions), [CLI 옵션](https://code.claude.com/docs/en/cli-reference), [SDK 권한](https://code.claude.com/docs/en/agent-sdk/permissions) | 장래 승인된 연동에서는 요청별 권한 화면과 제한된 도구 목록이 필요합니다. `bypassPermissions`를 기본값으로 쓰지 않는 편이 적절합니다. |
| 7. Pro/Max 한도 | Pro는 5시간 세션 한도와 주간 한도가 있습니다. Max 5x/20x는 Pro보다 세션 사용량이 각각 5배/20배이며 역시 5시간 및 주간 한도가 있습니다. 실제 사용 가능량은 메시지 길이·모델·기능에 따라 달라지고, Claude와 Claude Code에서 공유됩니다. [Pro 안내](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan), [Max 안내](https://support.claude.com/en/articles/11049741-what-is-the-max-plan), [Claude Code 사용](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan) | Max도 무제한이 아닙니다. 5x/20x 수치를 Jarvis Pet 사용량 보장치로 제시하면 안 됩니다. |
| 8. 운영체제 | Claude Code는 macOS 13 이상, Windows 10 1809 이상 또는 Windows Server 2019 이상을 지원합니다. Windows에서는 기본 실행과 WSL 실행을 지원합니다. [설치 요구 사항](https://code.claude.com/docs/en/setup) | 플랫폼 자체는 macOS/Windows MVP의 장애물이 아닙니다. |
| 9. 추가 비용 조건 | Console API 키를 사용하면 별도 API 요금이 적용됩니다. Claude Code에서 `ANTHROPIC_API_KEY` 환경변수가 설정되어 있으면 구독보다 API 키를 우선 사용할 수 있어 API 요금이 발생합니다. 구독 한도 이후 사용 크레딧을 선택하면 별도 요금이 발생합니다. [API 키 우선순위](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code), [Pro/Max 요금 안내](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan), [사용 크레딧](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) | 「API 비용 없음」을 보장하려면 별도 결제 경로로 자동 전환하지 않아야 합니다. 그러나 이는 **허가된 구독 연동이 있을 때의 비용 통제 조건**이지, 제3자 구독 연동 허가가 아닙니다. |
| 10. 제3자 앱 정책 | Agent SDK 문서는 사전 승인 없는 제3자 개발자의 claude.ai 로그인·구독 한도 제공을 금지하고, 고객 대상 제품에는 상업 약관이 적용된다고 안내합니다. 계정 안내는 제3자 트래픽을 구독 한도로 우회하거나 앱 정체를 다르게 표시하는 행위를 금지합니다. [Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview), [계정 로그인 안내](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) | Jarvis Pet을 Claude Code인 것처럼 표시하거나 CLI를 숨겨 호출해 구독 트래픽을 우회하는 설계는 피해야 합니다. 브랜드에도 Claude Code 제품명·외형을 모방하지 말라는 [Agent SDK 지침](https://code.claude.com/docs/en/agent-sdk/overview)이 있습니다. |

### 2026년 6월 안내의 해석

[「Claude 플랜에서 Agent SDK 사용」 안내](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)는 2026-06-15 업데이트에서 **변경 계획이 보류**되었으며, 당분간 Agent SDK·`claude -p`·제3자 앱의 사용량이 구독 한도에서 차감된다고 설명합니다. 아래에 남아 있는 「Pro $20/Max 5x $100/Max 20x $200의 월별 SDK 크레딧」 설명은 **시행 중인 혜택이 아닌 과거 예정안**입니다. 이 문서는 실제 사용량 처리 상태를 말합니다. 반면 [Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview)는 **제3자 제품 개발자에게 구독 로그인·한도를 제공할 권한이 있는지**를 직접 규정합니다. 따라서 사용량이 현재 구독 한도에서 차감된다는 사실을 Jarvis Pet 배포 허가로 해석할 수 없습니다.

## Jarvis Pet에 추천하는 연결 구조

1. **정식 제품 경로:** Jarvis Pet의 Claude 제공자를 **Claude Console API 기반**으로 설계합니다. 사용자가 API 키를 직접 준비하는 방식이나 Jarvis Pet의 자체 API 결제 방식을 검토할 수 있습니다. 두 방식 모두 기존 Pro/Max 구독에 포함된 사용량을 재사용하지 않으며 별도 요금이 들 수 있음을 연결 화면에 표시해야 합니다. API 키는 운영체제의 비밀 저장소에 저장하고 로그에 남기지 않는 설계가 적절합니다. [API 인증](https://platform.claude.com/docs/en/manage-claude/authentication), [API 과금](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)
2. **구독 활용을 고수한다면:** Anthropic에 **Jarvis Pet의 제3자 구독 로그인·사용량 연결에 대한 사전 승인**을 요청하고, 허용 범위·청구 방식·자동화·사용자 권한을 서면으로 확인한 뒤에만 구현합니다. 승인 전에는 이 경로를 제공자 선택지로 약속하지 않습니다. [Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview)
3. **비연동 안내 경로:** 사용자가 Claude Code나 Claude 앱을 직접 열어 쓰도록 안내하는 기능은 검토할 수 있습니다. Jarvis Pet이 프롬프트를 대신 전송하고 응답을 수집하는 자동 연결로 확장하면 다시 제3자 구독 사용 문제에 들어가므로 별도 정책 확인이 필요합니다. 이는 위 정책에 근거한 **제품 설계상 해석**입니다.

## MVP 현실성

- **「기존 Claude Pro/Max 구독만으로 Jarvis Pet 안에서 대화」 MVP:** 현재 공개 공식 문서만으로는 **진행 불가**로 판단합니다. 기술 검증용 CLI 호출이 성공하더라도 제품 출시 근거가 되지 않습니다.
- **「사용자가 별도 API 비용을 수용하는 Claude 연결」 MVP:** **기술적으로 가능**합니다. 공식 API/SDK, 구조화 응답, 사용량 통제, 사용자 승인 흐름을 이용할 수 있습니다. 다만 이는 Jarvis Pet의 「추가 API 과금 없음」 원칙과 맞지 않으므로 제품 요구사항을 바꾸거나 선택형 제공자로 두어야 합니다.
- **다음 의사결정:** Anthropic의 명시적 승인을 확보할지, Claude를 별도 과금이 있는 선택형 제공자로 둘지 결정해야 합니다. 승인 전에는 구독 재사용을 출시 문구나 기본 연결 경로로 제시하지 않는 것이 안전합니다.

## 확인 범위

공개된 Anthropic/Claude 공식 문서를 2026-09-25 기준으로 조사했습니다. Anthropic에 개별 승인 여부를 문의하거나 실제 Pro/Max 계정으로 Jarvis Pet 시제품을 실행해 보지는 않았습니다. 정책과 요금은 바뀔 수 있으므로 출시 직전에 위 정책 문서와 승인 상태를 다시 확인해야 합니다.
