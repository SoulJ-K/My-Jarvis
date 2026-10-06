# desktop-pet 심층 분석 v0.1

> 조사일: **2026-09-25**  
> 대상: [valerieliang/desktop-pet](https://github.com/valerieliang/desktop-pet) (`main` 브랜치의 공개 README·기본 설정 파일)  
> 분석 관점: Jarvis Pet의 성체 비서·에이전트 단계와 비교  
> 검증 범위: 공개 문서와 기본 설정을 확인했습니다. Windows에서 직접 설치·실행하거나 모든 소스 코드 경로를 감사하지 않았습니다. 아래 **확인**은 공개 자료에 명시된 사실, **추정/해석**은 그에 따른 제품 판단, **미확인**은 해당 자료만으로 결론 낼 수 없다는 뜻입니다.

## 1) 제품 한 줄 정의

**확인:** Windows 화면 위에 항상 떠 있는 투명한 펫 캐릭터를 통해 문자로 대화하고, 사용자 사실을 기억하며, 알람을 예약하고, 로컬 PC 도구를 호출하는 오픈소스 데스크톱 비서입니다. Python 3.10 이상과 OpenAI 호환 채팅 API를 사용하며 기본 모델 연결은 로컬 Ollama입니다. [README — 개요·기능](https://github.com/valerieliang/desktop-pet#what-it-does)

## 2) 핵심 사용자

**추정:** Windows PC에서 대화창 하나로 알림·시스템 제어·파일/명령 작업을 맡기고 싶고, Python·모델 백엔드·YAML 설정을 다룰 수 있는 개인 사용자 또는 개발자가 초기 주요 사용자로 보입니다. 공개된 사용자 조사나 실제 이용자 분포는 **미확인**입니다. 설치 절차에 Python 가상환경, Ollama 모델 내려받기, 설정 편집이 포함됩니다. [README — 시작하기](https://github.com/valerieliang/desktop-pet#quick-start), [설정 파일](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

## 3) 핵심 UX

**확인:** 배경 없는 항상 위 창에 캐릭터 이미지, 말풍선 대화, 입력창을 배치합니다. 답변은 문장 단위로 나타나고 감정 태그에 따라 표정 그림이 바뀝니다. `pet`/`tasks` 탭에서 캐릭터와 예약 알람·실행 중인 작업을 오가며, 별도 활동 창은 모델 연결 상태와 로그를 보여줍니다. `tools` 탭은 허용된 도구와 창 밖에 영향을 미치는 도구를 표시합니다. 도구가 실제 호출되면 상태 줄에 이름을 표시하고, 도구가 제시됐지만 아무것도 실행되지 않았다면 경고합니다. **해석:** 귀여운 외형 아래에 작업 상태를 노출하려는 “대화형 작업대” 경험입니다. [README — 기능](https://github.com/valerieliang/desktop-pet#what-it-does), [명령·도구 표시](https://github.com/valerieliang/desktop-pet#commands-and-seeing-what-the-pet-can-do), [작업 탭](https://github.com/valerieliang/desktop-pet#the-tasks-tab)

## 4) AI 없이 가능한 기능

**확인:** `/volume`, `/brightness`, `/weather`, `/tasks`, `/cancel` 및 `/<도구 이름>` 같은 직접 명령은 모델을 거치지 않고 도구를 실행합니다. 허용 목록은 이 경로에도 적용됩니다. 알람은 애플리케이션 내부 타이머와 저장 파일로 관리되므로 예약 후 정해진 시각의 알림 자체는 모델의 추론이 필요하지 않은 구조입니다. 다만 자연어를 해석하여 도구를 고르는 대화형 경험과 대화에서 사실을 추출하는 기억은 모델에 의존합니다. **미확인:** 모델 백엔드가 꺼졌을 때 앱 시작 및 직접 명령이 어디까지 가능한지는 시작 전 연결 점검이 있으므로 실행 확인이 필요합니다. 자율 이동·배고픔·수면처럼 AI와 독립된 펫 생활 주기는 README에서 확인되지 않습니다. [README — 직접 명령](https://github.com/valerieliang/desktop-pet#commands-and-seeing-what-the-pet-can-do), [알람](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders), [작동 구조](https://github.com/valerieliang/desktop-pet#how-it-works)

## 5) 감정/행동 시스템

**확인:** 모델이 답변에 `[joy]`, `[sadness]` 같은 태그를 붙이면 표시 파이프라인이 이를 제거하고 같은 이름의 정적 그림으로 교체합니다. 감정 목록은 `avatar.emotion_map`에서 정의합니다. 현재 Live2D 애니메이션은 구현되지 않았고 표정별 정적 이미지가 사용됩니다. **해석:** 여기의 감정은 지속적 내부 욕구·상태보다는 *응답 표현 계층*에 가깝습니다. 시간에 따른 감정 축적, 독립 행동 선택, 돌봄에 따른 상태 변화는 **미확인**입니다. [README — 감정](https://github.com/valerieliang/desktop-pet#emotions), [README — 미구현·한계](https://github.com/valerieliang/desktop-pet#not-built-yet)

## 6) 기억 시스템

**확인:** 매 대화 뒤 모델이 장기적으로 쓸 만한 사용자 사실을 추출해 로컬 `data/memory_facts.jsonl`에 한 줄씩 추가합니다. 다음 대화에서는 단어 겹침과 최근성을 사용해 관련 사실을 골라 프롬프트에 넣고, 최근 대화 몇 턴도 그대로 다시 보냅니다. 기본 설정은 최근 12턴, 사실 최대 1,000개, 주입 후보 5개입니다. 명령줄에서 사실 목록·검색·추가·삭제가 가능합니다. 이는 사용자를 기억하는 기능이지, 펫의 경험·신뢰·권한 성장 기록으로 확인된 것은 아닙니다. [README — 기억](https://github.com/valerieliang/desktop-pet#memory), [기본 설정 — memory](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

## 7) 성장 개념

**확인:** 공개 README와 기본 설정에 나이·발달 단계·경험에 따른 능력 해금·사용자 신뢰에 따른 권한 확대는 설명되지 않습니다. 캐릭터 정체성·성격·표정 이미지를 설정할 수 있고 사용자 사실은 쌓입니다. **해석:** “기억이 많아지는 비서”이지 “아기에서 성체로 성장하며 위임을 배우는 펫”으로 포지셔닝되지는 않습니다. 기능 부재를 단정하려면 코드·실행 검증이 필요합니다. [README — 정체성과 성격](https://github.com/valerieliang/desktop-pet#identity-and-personality), [README — 기억](https://github.com/valerieliang/desktop-pet#memory)

## 8) AI Provider 구조

**확인:** 하나의 OpenAI 호환 HTTP 채팅 API를 향하도록 설계되어 기본 Ollama 외에 llama.cpp, LM Studio, vLLM, OpenAI 또는 호환 서비스를 `engine`/`base_url`/`name`으로 지정할 수 있습니다. 호스팅형 서비스의 키는 환경변수 참조 방식으로 설정할 수 있습니다. 기억 추출에는 대화 모델을 재사용하거나 `memory.extraction_model`에 별도 모델을 지정할 수 있습니다. **해석:** *여러 제공자 중 연결 대상을 바꿀 수 있는 구조*는 있지만, 요청별로 여러 AI의 능력·비용·안전성을 비교해 업무를 나눠 맡기는 오케스트레이션은 공개 자료에서 **미확인**입니다. 특정 제공자로 전환했을 때 로컬 JSONL 기억은 파일로 남지만, 응답의 일관성은 모델마다 달라질 수 있습니다(추정). [README — 백엔드 선택](https://github.com/valerieliang/desktop-pet#choosing-a-backend), [기본 설정 — model·memory](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

## 9) 선제적 개입

**확인:** 일회성·반복 알람(매일, 평일, 매주, 매시간, 일정 간격)을 자연어 또는 도구로 예약합니다. 시간이 되면 소리·창 강조·작업 탭 전환으로 알리고, 기본값에서는 해제 전 재알림하되 횟수 상한이 있습니다. 앱이 꺼져 있던 사이 지난 일회성 알람은 다음 실행 때 “늦음”으로 울리고, 반복 알람은 다음 회차로 넘어갑니다. 백그라운드 작업 완료도 대화 중이 아니어도 알립니다. **한계:** 앱이 꺼진 시각에 시스템 알람처럼 울리지는 못합니다. 화면 맥락·사용자 집중도 등을 판단해 스스로 개입하는 기능은 **미확인**입니다. 따라서 선제성은 주로 **예약한 사건과 실행 중인 작업의 상태 변화**에 기반합니다. [README — 알람](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders), [README — 병렬 작업](https://github.com/valerieliang/desktop-pet#running-several-things-at-once), [README — 알려진 한계](https://github.com/valerieliang/desktop-pet#known-limitations)

## 10) Tool/Agent 기능

여기서 **도구(Tool)**는 펫이 호출할 수 있는 개별 PC 기능, **에이전트(Agent)**는 요청을 해석해 도구를 고르고 결과를 받아 다음 행동을 정하는 실행 흐름을 뜻합니다.

| 영역 | 공개 자료에서 확인된 역할 | 제품 관점의 의미 |
|---|---|---|
| 알람·리마인더 | `schedule_task`, 목록, 취소, 울리는 알람 해제. 일회성·반복·간격 예약, 재시작 후 복구 | 채팅을 실제 시간 기반 약속으로 연결. 반복 알람의 “해제”와 “영구 취소”를 구분 |
| 파일·개발 작업 | `file_read`, `file_write`, `git_status`, `shell_exec`, `code_interpreter` | 읽기부터 임의 파일 덮어쓰기·명령 실행까지 범위가 넓음 |
| 앱·시스템 | `open_app`, 웹사이트 열기, 볼륨·미디어·밝기·클립보드·시스템 상태·날씨 | 일상 PC 조작을 대화로 수행 |
| 네트워크·계산 | `web_search`, `http_request`, `calculator` | 외부 조회와 간단한 계산 수행 |
| 장기 작업 | 백그라운드 명령 시작·목록·결과·취소, 동시 도구 실행 | 한 번의 응답을 넘는 작업 추적; 작업 종료 시 알림 |

**확인된 실행 흐름:** 모델이 도구를 고르면 같은 프로세스에서 호출하고 결과를 받아 답변을 이어갑니다. 한 턴의 도구 반복에는 `max_rounds` 상한(기본 4)이 있고, 같은 라운드의 여러 도구는 기본적으로 병렬 실행됩니다. 긴 셸 작업은 최대 동시 실행 수(기본 4)와 시간 제한(기본 1,800초)을 둔 백그라운드 작업으로 분리합니다. 작업 목록에는 알람·실행 중인 작업과 취소 단추가 보입니다. 다만 백그라운드 작업은 앱 종료 시 중단되고 중간 출력은 실시간으로 표시되지 않습니다. [README — 도구](https://github.com/valerieliang/desktop-pet#tools), [README — 병렬 작업](https://github.com/valerieliang/desktop-pet#running-several-things-at-once), [기본 설정 — tools](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

**권한 모델의 핵심:** `tools.allow`는 *이 설치에서 어떤 도구가 아예 사용 가능한지* 정하는 허용 목록입니다. 목록에서 뺀 도구는 모델에게 제시되지 않고 직접 명령에서도 거부된다고 설명합니다. `tools.groups`는 입력 단어에 맞춰 모델에게 보여줄 도구 목록을 줄이는 **선택/정확도 장치**이며, 사용자별·파일별 권한 경계로 해석하면 안 됩니다. 기본 설정에는 `file_write`, `shell_exec`, `start_background_job`, `code_interpreter`, `open_app`, `clipboard_read`가 허용됩니다. README는 파일 쓰기가 사용자 계정이 쓸 수 있는 임의 파일을 만들거나 덮어쓸 수 있고, 셸 명령과 백그라운드 명령은 사용자 권한으로 실행되며, 클립보드 내용은 모델로 전달될 수 있다고 경고합니다. 즉 기본 권한은 넓습니다. [README — 도구가 접근할 수 있는 범위](https://github.com/valerieliang/desktop-pet#what-the-tools-can-reach), [기본 설정 — allow·groups](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

**승인·관찰 가능성:** 도구 탭은 허용된 도구와 위험 표시를 보여주고, 상태 줄은 실제 실행된 도구와 “도구가 제시됐지만 실행되지 않음”을 구분합니다. 이는 실행 후 확인을 돕습니다. 그러나 공개 README/설정에는 *파일 하나를 쓰거나 명령 하나를 실행하기 직전에 사용자에게 매번 확인받는 절차*, 경로별 허용 범위, 작업별 일회성 권한, 되돌리기 장치가 명시되지 않습니다. 이들은 **문서상 미확인**이지 코드상 절대 없다고 단정하는 말이 아닙니다. 웹 검색 결과의 문장도 도구 선택에 영향을 줄 수 있다고 프로젝트가 직접 경고하므로, 외부 내용이 위험한 실행으로 이어지는 경로를 특히 검토해야 합니다. 모델이 실행하지 않은 일을 했다고 주장하는 문제는 경고 표시가 일부만 잡으며, *잘못된 도구를 실행하고 성공했다고 말하는 경우*는 남는다고 README가 인정합니다. [README — 도구가 접근할 수 있는 범위](https://github.com/valerieliang/desktop-pet#what-the-tools-can-reach), [README — 상태 줄](https://github.com/valerieliang/desktop-pet#the-status-line), [README — 알려진 한계](https://github.com/valerieliang/desktop-pet#known-limitations)

## 11) 데이터 저장 방식

**확인:** 사용자 사실은 로컬 JSONL(`data/memory_facts.jsonl`), 예약 알람은 로컬 JSON(`data/scheduled_tasks.json`), 대화로 설정한 날씨 위치는 별도 로컬 JSON에 보관합니다. 활동 로그는 기본 `data/pet.log`에 기록됩니다. 최근 대화는 다음 요청의 문맥으로 쓰지만, 전체 대화 기록을 영구 저장하는지와 백업·암호화·동기화 방식은 공개 자료만으로 **미확인**입니다. 백그라운드 작업 프로세스는 저장·복원되지 않습니다. 외부 모델을 설정하면 모델 호출에 포함된 대화·기억·도구 결과가 해당 서비스로 전송될 수 있다는 점은 구조에 따른 **추정**이며, 실제 전송 필드는 코드 검증이 필요합니다. [README — 기억](https://github.com/valerieliang/desktop-pet#memory), [README — 알람](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders), [README — 로그](https://github.com/valerieliang/desktop-pet#reading-the-log), [기본 설정](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)

## 12) 비용/무료 사용 구조

**확인:** 저장소는 MIT 라이선스이며, 기본 구성은 로컬 Ollama와 다운로드한 모델을 사용합니다. 따라서 소프트웨어 라이선스료나 호스팅 모델 API 사용료 없이 시작할 수 있습니다. 로컬 모델을 돌릴 PC 자원·전력 비용은 남습니다. README의 예시는 4비트 7B 모델에 약 5GB 비디오 메모리가 든다고 설명합니다. 호스팅형 OpenAI 호환 서비스를 선택하면 요금은 해당 제공자의 정책과 사용량에 따르며, 이 프로젝트의 고정 구독 요금은 공개 자료에서 **확인되지 않습니다**. 웹 검색 기본 방식은 키 없는 제한적 결과이고, Brave API 키를 넣으면 더 넓은 검색을 쓸 수 있다고 설명합니다. [README — 시작하기](https://github.com/valerieliang/desktop-pet#quick-start), [README — 백엔드](https://github.com/valerieliang/desktop-pet#choosing-a-backend), [README — 한계·라이선스](https://github.com/valerieliang/desktop-pet#known-limitations)

## 13) 강점

1. **실제 수행 범위가 넓습니다.** 대화에서 알람, 파일, 앱, 명령, 웹, 시스템 제어까지 이어지고 긴 작업과 복수 작업도 다룹니다. [README — 기능·도구](https://github.com/valerieliang/desktop-pet#what-it-does)
2. **작업의 상태를 드러냅니다.** 도구 목록, 상태 줄, 작업 탭, 활동 창이 “말만 한 것”과 “실행한 것”의 차이를 보이려 합니다. [README — 상태 줄](https://github.com/valerieliang/desktop-pet#the-status-line)
3. **로컬 우선 구성과 모델 교체 폭이 있습니다.** 기억·알람이 로컬 파일에 있고 여러 OpenAI 호환 백엔드를 설정할 수 있습니다. [README — 백엔드·기억](https://github.com/valerieliang/desktop-pet#choosing-a-backend)
4. **알람의 실패 상황을 다룹니다.** 해제 전 재알림, 앱 재시작 후 지난 일회성 알림 복구, 반복 알람의 다음 회차 계산이 문서화돼 있습니다. [README — 알람](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders)

## 14) 약점/한계

**확인된 제약:** Windows 중심이며 음성 입출력·Live2D가 없습니다. 알람은 앱이 실행 중일 때만 제시간에 울립니다. 백그라운드 작업은 종료 시 사라지고 출력은 끝난 뒤 보입니다. 모델은 실행하지 않은 일을 했다고 말하거나 잘못된 도구를 고를 수 있습니다. 기본 검색은 제한적이고, 일부 PC 제어는 완료 상태를 확인하지 않습니다. [README — 미구현·알려진 한계](https://github.com/valerieliang/desktop-pet#not-built-yet)

**제품 관점의 한계(해석):** 넓은 도구 허용 목록은 편리하지만 “어떤 파일에, 이번 한 번만, 어떤 결과까지” 맡길지 세밀하게 조절하는 경험은 공개 자료에 보이지 않습니다. 감정은 표정 전환 중심이고, 펫의 성장·관계가 비서 권한으로 이어지는 서사도 확인되지 않습니다. 이는 실사용 품질이나 보안 취약점을 확정한 평가는 아닙니다. [README — 권한 범위](https://github.com/valerieliang/desktop-pet#what-the-tools-can-reach), [README — 감정](https://github.com/valerieliang/desktop-pet#emotions)

## 15) Jarvis Pet과 겹치는 부분

**확인·비교:** Jarvis Pet 구상의 대화형 데스크톱 캐릭터, 로컬 장기 기억, 여러 모델 연결 가능성, 알람·리마인더, 파일·앱·명령 실행, 진행 중인 업무 표시와 겹칩니다. 특히 “일을 하는 펫”과 “로컬 모델도 가능한 펫”은 이미 존재하는 조합입니다. 다만 Jarvis Pet의 계획은 내부 [PRD](../../docs/Jarvis_Pet_PRD.md)를 기준으로 비교한 것이며, 현재 구현 완료를 뜻하지 않습니다. [desktop-pet README](https://github.com/valerieliang/desktop-pet)

## 16) Jarvis Pet이 참고할 부분

1. **직접 명령과 자연어를 함께 제공:** 알람 취소 같은 확실한 행동은 모델의 해석 없이도 실행되게 합니다. [README — 직접 명령](https://github.com/valerieliang/desktop-pet#commands-and-seeing-what-the-pet-can-do)
2. **권한을 사용자에게 보이게 하기:** 허용된 기능과 민감한 기능을 한 화면에서 보여주고, 실제 실행 도구를 결과에 붙입니다. [README — 도구 탭·상태 줄](https://github.com/valerieliang/desktop-pet#commands-and-seeing-what-the-pet-can-do)
3. **알람의 수명주기 설계:** 예약·반복·울림·해제·영구 취소·재시작 후 처리의 차이를 먼저 정의합니다. [README — 알람](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders)
4. **작은 모델을 고려한 도구 노출:** 한 번에 모든 도구를 보이면 모델이 도구를 고르지 못할 수 있어 관련 기능만 제시한다는 관찰을 참고합니다. 단, 키워드 분류는 권한 승인과 분리해야 합니다. [README — 도구](https://github.com/valerieliang/desktop-pet#tools)

## 17) Jarvis Pet이 피하거나 다르게 가져갈 부분

**제안(경쟁 제품의 결함 확정 아님):** 초기 설정에서 파일 덮어쓰기·임의 명령·클립보드 읽기 같은 넓은 권한을 한꺼번에 주기보다, 펫의 성장 단계와 사용자가 승인한 업무 범위에 맞춰 기능을 열어야 합니다. `도구 허용`(앱이 할 수 있는 일), `이번 실행 승인`(지금 이 행동을 해도 되는지), `실행 결과 확인`(실제로 무엇이 바뀌었는지)을 별개 단계로 설계하는 것이 좋습니다. 파일 쓰기는 경로·변경 미리보기·되돌리기, 명령은 실행 내용·영향 범위·중지 방법을 명시하는 방향이 가설입니다. 또한 화면에 뜬 모델의 성공 선언보다 도구 결과와 실제 상태를 우선해야 합니다. [README — 권한 범위](https://github.com/valerieliang/desktop-pet#what-the-tools-can-reach), [README — 한계](https://github.com/valerieliang/desktop-pet#known-limitations)

## 18) 현재 Jarvis Pet 차별화 가설(펫의 성장=Agency/권한/비서능력 성장, 여러 AI/Tool 오케스트레이션)에 주는 영향

**판단:** desktop-pet는 이미 *도구를 고르고 연속·병렬 실행하는 비서*이므로 “펫에게 에이전트 기능이 있다”는 것만으로는 차별화가 어렵습니다. 또한 여러 OpenAI 호환 백엔드를 설정할 수 있어 “모델을 바꿀 수 있다”도 단독 차별점이 아닙니다. [README — 도구·백엔드](https://github.com/valerieliang/desktop-pet#tools)

**남는 가설(추정):** 경쟁 제품의 공개 설명에는 펫의 생활·관계·신뢰가 *사용자가 위임하는 일의 범위*와 함께 성장하는 구조가 보이지 않습니다. Jarvis Pet은 (1) AI 없이도 살아 있는 초기 펫, (2) 기억·작은 도움, (3) 사용자가 명시적으로 허락한 PC 작업, (4) 여러 AI와 도구의 업무별 선택을 **한 펫의 연속된 정체성과 검증 가능한 권한 이력**으로 묶을 때 차별화 가능성이 있습니다. 여기서 “성장”이 시간이 지났다는 이유로 자동 권한 상승을 뜻하면 안 됩니다. 능력의 학습·해금과 실제 권한 부여는 분리하고, 권한은 언제든 회수 가능해야 합니다. 여러 AI/도구 오케스트레이션 역시 제공자 목록 수가 아니라 *어떤 일을 왜 어느 모델·도구에 보냈고, 비용과 결과가 무엇인지* 사용자가 이해할 수 있어야 검증됩니다. 이 가설의 이용자 가치는 아직 실사용 검증 전입니다.

## 19) 추가 코드 분석이 필요한 지점

다음은 README의 설명을 실제 실행 경로로 검증하기 위한 우선순위입니다. 코드·Windows 실사용 확인 전에는 결론으로 취급하지 않습니다.

1. **권한 우회 가능성:** `tools.allow`가 모델 호출, 직접 명령, 백그라운드 작업, 도구 간 연쇄 호출 모두에 동일하게 적용되는지. 키워드 그룹의 선택 결과가 권한 경계와 뒤섞이지 않는지.
2. **실행 직전 승인:** `file_write`, `shell_exec`, `start_background_job`, `open_app`, `clipboard_read`, `http_request`에 개별 확인·경로 제한·네트워크 대상 제한이 있는지. 기본 설정 외 다른 실행 경로가 있는지.
3. **파일·명령의 실제 범위:** 파일 경로 정규화, 심볼릭 링크, 덮어쓰기, 작업 디렉터리, 셸 인자 전달, 자식 프로세스 종료, 시간·출력 크기 제한. `code_interpreter`의 “격리”가 어떤 보안 경계인지.
4. **외부 문서의 영향:** 웹 검색·HTTP·파일 읽기 결과가 모델 프롬프트에 들어간 뒤 위험한 도구 호출을 유도할 때 제어가 있는지.
5. **결과 검증:** 도구 오류·부분 성공·동시 실행 순서가 상태 줄 및 최종 답변에 정확히 반영되는지. 앱 실행 후 실제 시작 여부 확인이 가능한지.
6. **알람 정확성:** 시간대·일광절약시간·자정 경계·반복 규칙·앱 종료 후 복구·손상된 저장 파일 처리·동시 취소 경쟁 상태.
7. **기억·개인정보:** 사실 중복·수정·삭제의 전파, 민감 사실 필터, 로그의 개인정보 포함, 외부 모델에 전달되는 기억·클립보드·파일 내용의 정확한 범위.
8. **모델 교체·오케스트레이션:** 대화/기억 추출 모델 분리가 실제로 어떻게 작동하는지, 실패 시 대체 모델 선택이나 업무별 제공자 배분이 있는지.
9. **사용성 실험:** Windows에서 무모델 상태, 낮은 성능의 로컬 모델, 알람 지속 사용, 취소/권한 해제, 실행 실패 시 신뢰 회복을 실제 사용자에게 관찰할 것.

### 주요 공개 출처

- [desktop-pet 공식 GitHub 저장소 및 README](https://github.com/valerieliang/desktop-pet)
- [기본 `config.yaml` — 모델·기억·도구 허용 목록·알람 설정](https://github.com/valerieliang/desktop-pet/blob/main/config.yaml)
- [README — 도구 접근 범위](https://github.com/valerieliang/desktop-pet#what-the-tools-can-reach)
- [README — 알람과 재시작 처리](https://github.com/valerieliang/desktop-pet#alarms-timers-and-reminders)
- [README — 알려진 한계](https://github.com/valerieliang/desktop-pet#known-limitations)

> 참고: 링크는 조사일 기준 공개 `main`을 가리킵니다. 이후 저장소가 바뀌면 내용도 달라질 수 있습니다.
