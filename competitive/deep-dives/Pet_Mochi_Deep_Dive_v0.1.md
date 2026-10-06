# Pet Mochi 심층 분석 v0.1

- **조사일:** 2026-09-25
- **대상:** [cskwork/pet-mochi](https://github.com/cskwork/pet-mochi) 및 [공식 소개 페이지](https://cskwork.github.io/pet-mochi/). 이름이 비슷한 다른 Mochi 프로젝트는 분석 대상이 아니다.
- **조사 범위:** 공개 README, 제품 소개, PRD, 일부 공개 소스 확인. 앱을 설치해 장시간 사용하거나 성능·안전성을 독립 시험하지 않았다.
- **표기:** **확인**은 공개 문서·코드에 직접 근거가 있는 내용, **추정/평가**는 그 근거에서 도출한 제품 판단, **미확인**은 공개 자료만으로 단정할 수 없는 내용이다. README의 ‘구현됨’ 주장은 실제 사용자 환경에서의 동작 검증과 구별한다.
- **Jarvis Pet 기준:** 로컬 [Jarvis Pet PRD](../../docs/Jarvis_Pet_PRD.md)의 구상. 아직 구현된 기능이라는 뜻은 아니다.

## 1) 제품 한 줄 정의

**확인:** 데스크톱에 상주하며 자체적인 욕구·감정·움직임을 로컬에서 계산하고, 선택적으로 로컬 대화용 AI 모델을 연결하는 오픈소스 디지털 펫이다. 핵심 문구는 “AI가 꺼져도 살아 있어야 한다”이다. [공식 소개](https://cskwork.github.io/pet-mochi/), [README](https://github.com/cskwork/pet-mochi#why-pet-mochi)

## 2) 핵심 사용자

**확인:** [PRD의 대상 사용자](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#5-target-users)는 데스크톱에 사는 오픈소스 AI 펫, 로컬 기억, 사생활 보호를 원하는 기술 사용자이며, 취미 사용자와 향후 확장 개발자를 부차적 대상으로 둔다. [PRODUCT.md](https://github.com/cskwork/pet-mochi/blob/main/PRODUCT.md#users)는 저장소를 보고 직접 복제·실행할 개발자와 애호가를 소개 페이지의 주요 방문자로 정의한다.

**추정/평가:** 현재 배포 방식이 설치 파일 다운로드가 아니라 소스 복제 후 개발 도구 설치·실행이므로, 일반 소비자보다 설정을 감수할 수 있는 사용자에게 접근성이 높다. 실제 이용자 구성·유지율 자료는 **미확인**이다. [공식 빠른 시작](https://cskwork.github.io/pet-mochi/#quickstart), [PRODUCT.md](https://github.com/cskwork/pet-mochi/blob/main/PRODUCT.md#capabilities-and-constraints)

## 3) 핵심 UX

**확인:** 투명한 최상단 창의 펫을 끌어 움직이고, 평소에는 돌아다니거나 자고 커서를 바라본다. 사용자는 먹이 주기·놀기·쓰다듬기·쉬기·보고서를 요청할 수 있다. 필요 상태는 색조와 기호로 보이며, 돌아온 사용자를 반기고 작은 기념품·기념일 반응을 제공한다. 소리는 끌 수 있고, 배경 카드와 설정 패널이 있다. 선택적으로 짧은 채팅을 제공한다. 12시간 간격 상태 보고서는 조용한 시간에 생성되어 설정 화면에서 열람한다. 파일 요약은 전용 받은 편지함에 파일을 넣고 해당 파일 읽기를 허용해야 한다. [README의 현재 기능](https://github.com/cskwork/pet-mochi#what-mochi-can-do-today), [PRD의 사용자 흐름](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#7-mvp-user-experience)

**추정/평가:** 진입 경험은 ‘말을 거는 비서’보다 ‘먼저 살아 있는 존재를 돌보고 관찰하는 펫’에 가깝다. 사용자가 AI 설정을 하지 않아도 즉시 만지고 반응을 볼 수 있어 첫 경험의 부담이 낮다. 반대로 실제 업무 해결을 기대하는 사용자에게는 현재 역할이 좁다.

## 4) AI 없이 가능한 기능

**확인:** 핵심 루프는 약 **3초마다** 상태에 시간 경과를 적용하고, 감정을 정한 뒤, 움직임을 선택한다. 코드의 `runTick(state, ctx, elapsedSeconds)`는 `applyDecay → deriveMood → chooseMovement` 순서로 새 펫 상태를 만든다. 배고픔·에너지·애정·지루함·호기심·스트레스·관계 수치가 상태에 포함된다. 직접 행동(먹이·놀이·휴식·쓰다듬기)은 규칙 기반으로 수치를 바꾸고 짧은 고정 문구와 애니메이션을 즉시 보여준다. AI가 없거나 답이 잘못되어도 정해진 애니메이션을 고르는 대체 경로가 있다. 상태 보고서 역시 통계에서 문장을 만드는 대체 경로가 있다. [tick.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/tick.ts), [state.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/state.ts), [actions.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/actions.ts), [choreography.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/choreography.ts), [report.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/llm/report.rs)

**제품적 의미:** 펫의 ‘생존’과 AI 서비스의 가용성을 분리한다. 네트워크·모델 설치·응답 속도에 관계없이 몸짓과 돌봄 반응이 계속된다. 계속 켜 두는 제품에서 비용·지연·고장 인식을 줄이고, AI 호출은 대화·기억 추출·회고 같은 드문 순간에 집중할 수 있다. 로컬 상태 규칙이 먼저 있고 언어 모델은 필요한 장면을 풍부하게 만드는 구조다. 이것은 Jarvis Pet의 초기 펫 경험에도 적용할 만한 **구현 원칙**이지, 그 자체로 차별화 기능은 아니다. [PRD §6](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#6-core-product-principles), [공식 소개](https://cskwork.github.io/pet-mochi/#under-the-hood)

**정확성 주의:** 프로젝트가 말하는 ‘결정적(deterministic)’은 주로 규칙과 대체 경로를 뜻한다. 실제 움직임 선택에는 기본값으로 난수가 들어가고 시간도 반영된다. 같은 입력이면 언제나 완전히 같은 화면 동작이 나온다는 뜻으로 해석하면 안 된다. [movement.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/movement.ts), [decay.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/decay.ts)

## 5) 감정/행동 시스템

**확인:** 숨겨진 수치가 시간에 따라 바뀌며, 감정은 우선순위 규칙으로 계산된다: 에너지 <20이면 피곤함, 배고픔 >75, 지루함 >70, 애정 <20, 호기심 >70, 그 외 행복. 움직임은 낮은 에너지, 사용자의 복귀, 가까운 커서, 야간, 지루함, 긍정 이벤트에 반응한다. 표정 색과 기호가 감정을 보완한다. 외부 AI가 행동 연출에 개입할 때도 정해진 연출 목록의 이름·변형 번호만 고르며 임의의 애니메이션 명령이나 자유 문장 말풍선을 거부한다. [mood.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/mood.ts), [movement.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/movement.ts), [choreography.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/choreography.ts), [공식 감정 소개](https://cskwork.github.io/pet-mochi/#under-the-hood)

**추정/평가:** 감정은 자유로운 심리 모델이 아니라 관찰 가능한 행동을 만들기 위한 상태 기계다. 장점은 일관성과 설명 가능성, 한계는 오래 쓰면 반복을 느낄 가능성이다. 실제 장기 사용자의 반복 피로 여부는 **미확인**이다.

## 6) 기억 시스템

**확인:** 펫 상태, 상호작용, 기억, 이벤트 등을 로컬 SQLite 데이터베이스에 저장한다. 기억은 FTS5 전문 검색으로 후보를 찾고 중요도 0.4, 최근성 0.3, 신뢰도 0.3의 가중치로 다시 정렬한다. 대화 때 관련 기억을 가져오고, AI 기반 응답 뒤에는 기억 추출을 시도한다. 설정에서 기억을 확인·삭제·내보내는 기능을 문서화했다. [README의 아키텍처](https://github.com/cskwork/pet-mochi#architecture), [db.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/db.rs), [README의 채팅 설명](https://github.com/cskwork/pet-mochi#talking-to-mochi-optional)

**추정/평가:** 단순 대화 이력보다 오래 남길 선호·맥락을 분리해 재사용하려는 설계다. 검색은 키워드 기반이며 의미 유사도 검색은 향후 계획이다. 기억이 실제로 얼마나 정확하게 추출·갱신되는지, 틀린 기억을 어떻게 정정하는지에 관한 사용성은 **미확인**이다. [로드맵](https://github.com/cskwork/pet-mochi#coming-next-roadmap)

## 7) 성장 개념

**확인:** 관계 수준, 신뢰, 애정 등 지속 상태가 있으며 친밀도에 따른 반응과 기념품·부화 기념일 같은 장기 사용 보상이 있다. 하지만 옷장과 성장 단계는 현재 기능이 아니라 로드맵에 있다. 현재 자료에서 새로운 도구 권한이나 비서 능력을 성장에 따라 해금하는 구조는 확인되지 않는다. [state.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/state.ts), [README의 현재 기능과 로드맵](https://github.com/cskwork/pet-mochi#what-mochi-can-do-today), [PRD의 범위](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#8-mvp-scope)

**추정/평가:** 현 단계의 성장은 주로 관계·정서·수집 경험이다. Jarvis Pet이 구상하는 ‘신뢰가 쌓일수록 승인된 업무 범위와 비서 능력이 확장되는 성장’과는 축이 다르다.

## 8) AI Provider 구조

**확인:** AI 공급자 연결을 교체할 수 있도록 Rust의 `LlmProvider` 인터페이스를 두었고, 공개 코드의 첫 구현은 로컬 **Ollama**다. 기본 경험은 모델을 설치하지 않은 무음 모드다. 채팅을 쓰려면 Ollama와 모델을 별도로 준비하고 설정에서 공급자·주소·모델을 지정한다. PRD는 클라우드 공급자 연결을 향후 선택지로 언급하지만, 현재 공개 설명에서 실제 연결 구현은 Ollama만 확인된다. [provider.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/llm/provider.rs), [llm 디렉터리](https://github.com/cskwork/pet-mochi/tree/main/src-tauri/src/llm), [README 설정](https://github.com/cskwork/pet-mochi#talking-to-mochi-optional), [PRD §4](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#4-goals-and-non-goals)

**추정/평가:** 공급자를 바꿀 수 있는 연결 지점은 이미 있지만, 여러 모델을 요청 유형별로 선택하고 결과를 조합하는 운영 체계는 확인되지 않는다. ‘교체 가능’과 ‘여러 AI의 오케스트레이션(작업별 선택·연결)’은 다른 제품 능력이다.

## 9) 선제적 개입

**확인:** 사용자의 복귀, 받은 편지함의 새 파일, 시간대 변화, 약 12시간이 지난 조용한 시간 같은 사건을 감지한다. 사건 중요도와 펫의 상태·관계 가중치가 임계값에 닿아야 자율적인 AI 호출 후보가 되고, 90초 대기 제한이 있다. 직접 보낸 채팅은 이 점수 문턱을 건너뛴다. 돌봄 행동만으로 계속 AI를 호출하도록 설계하지 않았다. 보고서는 밀린 횟수를 한꺼번에 생성하지 않고 조용히 저장한다. [salience.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/salience.ts), [statusReportGate.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/statusReportGate.ts), [README](https://github.com/cskwork/pet-mochi#design-choices-worth-knowing)

**추정/평가:** 선제성은 ‘주의를 끌 만한 순간에 반응’하는 수준이다. 사용자의 목표를 추론해 외부 앱에서 일을 시작하는 능력은 확인되지 않는다. 침묵·대기 제한을 명시해 상시 켜 두는 펫의 피로감을 줄이는 방향이다.

## 10) Tool/Agent 기능

**확인:** 전용 `inbox/`의 `.txt`, `.md`, `.json` 파일을 감지하고 **파일별 동의**를 받은 후 읽어 요약할 수 있다. `notes/`, `dreams/`, `exports/`에만 쓰도록 제한한다. 선언형 스킬 목록은 있지만 임의 코드를 실행하는 플러그인 체계가 아니다. 셸 명령 실행, 브라우저 자동화, 이메일·캘린더 연동, 복잡한 다중 에이전트 협업은 MVP 범위 밖이라고 명시한다. [README의 샌드박스 설명](https://github.com/cskwork/pet-mochi#sandbox), [sandbox.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/sandbox.rs), [PRD §4.2](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#42-non-goals-for-mvp)

**추정/평가:** 현재는 권한을 좁게 둔 ‘작은 도우미’다. 파일 요약·기억 내보내기 정도는 가능하지만, 여러 도구를 골라 실제 업무 흐름을 완수하는 비서로 보기는 어렵다.

## 11) 데이터 저장 방식

**확인:** 운영체제별 로컬 Pet Mochi 홈 폴더에 `mochi.db`(SQLite), 받은 편지함, 메모, 보고서, 내보내기 폴더를 둔다. 지정된 경로 밖 파일을 읽고 쓰지 않도록 경로를 검사한다. 계정·클라우드 동기화·원격 측정 없이 동작한다고 프로젝트가 설명한다. 기억을 Markdown/JSON 형태로 내보내는 구조가 문서화되어 있다. [README의 폴더 구조](https://github.com/cskwork/pet-mochi#sandbox), [db.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/db.rs), [공식 소개](https://cskwork.github.io/pet-mochi/)

**추정/평가:** 사용자가 데이터를 직접 확인·삭제·백업하기 쉬운 형태다. 다만 실제 보안 강도와 모든 경로의 동의 처리 여부는 별도 코드 감사·실행 검증이 필요하다. 클라우드 공급자를 나중에 연결할 경우 데이터가 계속 로컬에만 머무른다고 자동으로 보장되지는 않는다.

## 12) 비용/무료 사용 구조

**확인:** 소스는 MIT 허가로 공개되어 있고 현재 공식 안내는 저장소 복제 후 직접 실행하는 방식이다. 설치 파일은 아직 제공하지 않는다고 제품 문서가 밝힌다. 기본 펫 동작은 AI·네트워크 호출을 요구하지 않고, 대화에는 사용자가 별도로 로컬 Ollama를 설치한다. 프로젝트의 유료 요금제·구독료는 공개 자료에서 확인되지 않는다. [LICENSE](https://github.com/cskwork/pet-mochi/blob/main/LICENSE), [공식 빠른 시작](https://cskwork.github.io/pet-mochi/#quickstart), [PRODUCT.md](https://github.com/cskwork/pet-mochi/blob/main/PRODUCT.md#capabilities-and-constraints)

**추정/평가:** 소프트웨어 사용료가 없는 형태로 보이지만 설치·운영의 시간, 로컬 모델을 돌릴 기기 자원과 전력은 사용자 부담이다. 향후 클라우드 모델을 연결하면 해당 공급자의 요금이 별도로 발생할 수 있으나, 현재 제품의 유료 제공 계획은 **미확인**이다.

## 13) 강점

1. **확인:** AI 없이도 몸짓·욕구·반응이 유지되는 구조가 분명하다. **평가:** 펫의 신뢰성과 첫 경험을 AI 품질에서 분리한다. [tick.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/tick.ts)
2. **확인:** 로컬 저장, 기억 열람·삭제·내보내기, 파일별 동의, 제한된 읽기·쓰기 범위를 제공한다고 문서화했다. **평가:** 개인적인 펫을 계속 켜 두는 데 필요한 통제감을 준다. [README](https://github.com/cskwork/pet-mochi#why-pet-mochi)
3. **확인:** 사건 중요도 문턱과 대기 제한, 조용한 보고서, 대체 동작을 둔다. **평가:** 응답 비용과 방해 빈도를 관리하려는 제품 설계가 구체적이다. [salience.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/salience.ts)
4. **확인:** 단순 수치 막대뿐 아니라 애니메이션·색조·기호·기념일·작은 선물로 정서를 표현한다. **평가:** ‘살아 있음’을 기능 설명보다 체감하게 한다. [README](https://github.com/cskwork/pet-mochi#what-mochi-can-do-today)

## 14) 약점/한계

1. **확인:** 공식 소개는 아직 설치 파일이 없고 직접 소스를 받아 실행해야 한다고 한다. **평가:** 대중 사용자 유입 장벽이 높다. [공식 소개](https://cskwork.github.io/pet-mochi/#quickstart)
2. **확인:** 음성, 여러 펫, 성장 단계, Git·테스트 실행기 감시는 로드맵이다. **평가:** 현재 장기 성장 경험과 생산성 연결 범위가 좁다. [README 로드맵](https://github.com/cskwork/pet-mochi#coming-next-roadmap)
3. **확인:** 파일 접근은 전용 받은 편지함과 제한된 쓰기 폴더 중심이다. **평가:** 안전한 대신 일반적인 파일·앱 작업을 맡기기는 어렵다. [README 샌드박스](https://github.com/cskwork/pet-mochi#sandbox)
4. **확인:** 현재 공개된 AI 공급자 구현은 Ollama 하나다. **평가:** 공급자 교체 설계의 실제 확장성이나 다중 AI 운용은 아직 실증되지 않았다. [llm 디렉터리](https://github.com/cskwork/pet-mochi/tree/main/src-tauri/src/llm)
5. **미확인:** 실사용자 수, 장기 사용 유지율, 기기별 자원 사용량, 모든 운영체제에서의 안정성. 따라서 제품 적합성과 운영 품질을 수치로 평가할 수 없다.

## 15) Jarvis Pet과 겹치는 부분

**확인:** 양쪽 구상 모두 데스크톱 상주 펫, AI 없이 동작하는 기본 행동, 감정·관계, 장기 기억, 선택적 AI 연결, 장차 도구를 통한 행동을 포함한다. Pet Mochi의 현재 구현은 특히 로컬 행동 루프, 감정 표출, 기억 관리, 제한된 파일 읽기에서 Jarvis Pet 초기 구상과 직접 겹친다. [Pet Mochi PRD](https://github.com/cskwork/pet-mochi/blob/main/PRD.md), [Jarvis Pet PRD](../../docs/Jarvis_Pet_PRD.md)

**평가:** 따라서 ‘AI가 없어도 움직이는 감정 펫’, ‘로컬 기억’, ‘AI 공급자 교체 인터페이스’만을 Jarvis Pet의 독자적 차별화로 주장하기는 어렵다.

## 16) Jarvis Pet이 참고할 부분

1. **로컬 우선 동작 계약:** 네트워크·모델·데이터베이스 실패 때도 먹이·놀이·수면·기본 반응이 끊기지 않도록 핵심 상태 루프를 분리한다. Pet Mochi의 규칙 적용 → 감정 도출 → 움직임 선택 → 필요할 때 AI 호출 구조가 참고 사례다. [tick.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/tick.ts), [README 설계 선택](https://github.com/cskwork/pet-mochi#design-choices-worth-knowing)
2. **권한이 보이는 파일 흐름:** 파일별 동의, 전용 수신함, 좁은 쓰기 대상처럼 펫의 행동 범위를 사용자에게 설명 가능한 단위로 둔다. [README 샌드박스](https://github.com/cskwork/pet-mochi#sandbox)
3. **드문 AI 호출:** 사건 중요도·대기 제한·무음 대체 동작을 합쳐 비용과 알림 피로를 제한한다. [salience.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/salience.ts)
4. **기억의 소유권:** 기억을 특정 AI 서비스에 묶지 않고 사용자가 보고 지울 수 있게 한다. Jarvis PRD의 ‘AI Provider가 바뀌어도 기억 유지’ 원칙과 일치한다. [db.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/db.rs), [Jarvis Pet PRD](../../docs/Jarvis_Pet_PRD.md)

## 17) Jarvis Pet이 피하거나 다르게 가져갈 부분

1. **추정/제안:** 성장의 중심을 호감도·기념품·외형에만 두지 않는다. 사용자가 승인한 범위 안에서 리마인더 → 파일 요약 → 일정 보조처럼 수행 가능한 일이 실제로 늘어나는지 보여준다.
2. **추정/제안:** ‘교체 가능한 AI 연결 코드’와 ‘여러 AI·도구를 골라 일을 끝내는 능력’을 제품 화면과 평가에서 분리한다. 지원 공급자 수보다 어떤 일을 더 잘 끝내는지가 중요하다.
3. **추정/제안:** 로컬 시뮬레이션을 귀여운 반응에만 쓰지 않고, 현재 권한·진행 중인 일·실패 후 복구 상태까지 펫 행동에 반영한다. 그러면 비서 능력의 성장이 펫의 몸짓과 연결된다.
4. **추정/제안:** 장기 사용 중 알림·수치 하락이 돌봄 의무나 죄책감으로 느껴지지 않는지 확인한다. Pet Mochi가 복귀 환영에서 죄책감을 주지 않는다고 명시한 점은 좋은 기준이다. [README](https://github.com/cskwork/pet-mochi#what-mochi-can-do-today)

## 18) 현재 Jarvis Pet 차별화 가설(펫의 성장=Agency/권한/비서능력 성장, 여러 AI/Tool 오케스트레이션)에 주는 영향

**판단: 가설은 아직 유효하지만, 기반 기술만으로는 차별화되지 않는다.** Pet Mochi는 펫의 생동감, 기억, AI의 선택적 호출, 제한된 도구까지 이미 공개했다. 반면 현재 공개 범위는 관계 중심 성장과 단일 로컬 모델, 좁은 파일 샌드박스에 머문다. [Pet Mochi README](https://github.com/cskwork/pet-mochi), [PRD 비목표](https://github.com/cskwork/pet-mochi/blob/main/PRD.md#42-non-goals-for-mvp)

Jarvis Pet의 차별화는 아래의 **사용자에게 보이는 변화**로 검증해야 한다. 이는 제안이며 현재 구현 사실이 아니다.

| 검증 질문 | Pet Mochi의 현재 공개 범위 | Jarvis Pet이 입증할 가설 |
|---|---|---|
| 펫이 성장하면 무엇이 달라지나? | 관계 반응·기념품 중심; 성장 단계는 계획 | 사용자가 승인한 권한과 완료 가능한 업무가 단계적으로 증가 |
| AI 공급자를 왜 여러 개 쓰나? | 교체용 인터페이스, Ollama 구현 | 요청별 적합한 AI·로컬 기능을 선택하고 결과를 한 흐름으로 연결 |
| 자율성은 어떻게 통제하나? | 사건 문턱·대기 제한·파일별 동의 | 업무별 권한·승인·취소·실행 기록과 실패 복구가 성장과 함께 작동 |
| 펫으로서의 매력은 유지되나? | 로컬 시뮬레이션이 중심 | 비서 상태와 펫의 몸짓이 연결되어 AI가 없어도 살아 있고, 일을 할 때는 더 유능해 보임 |

**반증 가능성:** 여러 AI를 붙여도 사용자 과제를 더 빠르고 믿을 만하게 끝내지 못하거나, 권한 단계가 복잡함만 늘리면 차별화 가설은 약해진다. 반대로 한 공급자와 소수 도구만으로도 ‘성장 후 실제로 맡길 수 있는 일이 늘었다’는 경험을 재현하면 가설의 핵심을 조기에 검증할 수 있다. [Jarvis Pet PRD](../../docs/Jarvis_Pet_PRD.md)

## 19) 추가 코드 분석이 필요한 지점

이번 문서는 공개 소스의 핵심 경로를 일부 읽은 **제품 분석**이다. 아래는 독립 실행 검증 또는 더 깊은 코드 추적이 필요한 항목이다.

1. **상태 저장과 재시작:** 3초 루프의 실제 호출 위치, 저장 주기, 앱 종료·절전·긴 오프라인 후 경과 시간 반영, DB 오류 시 복구를 추적한다. [tick.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/tick.ts), [App.svelte](https://github.com/cskwork/pet-mochi/blob/main/src/App.svelte), [db.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/db.rs)
2. **자율 AI 호출의 실제 연결:** `shouldCallLLM`은 사건의 점수·대기 여부를 계산한다. 이벤트 버스에서 기록된 사건이 실제 채팅·연출·보고서 호출로 어떻게 이어지는지 끝까지 추적하고, 문서의 ‘선제적 AI 개입’ 표현과 일치하는지 확인한다. [salience.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/salience.ts), [bus.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/events/bus.ts)
3. **로컬 시뮬레이션의 체감 품질:** 장시간 방치 시 상태 수치가 바닥·천장에 고착되는지, 난수 움직임이 단조로운지, 저사양 장치에서 전력·메모리 비용이 어느 정도인지 실제 앱으로 측정한다. [decay.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/decay.ts), [movement.ts](https://github.com/cskwork/pet-mochi/blob/main/src/lib/sim/movement.ts)
4. **기억의 신뢰성:** 기억 추출 실패, 중복·오래된 사실 정정, 검색 후보가 없을 때의 동작, 삭제·내보내기 후 잔존 데이터를 확인한다. [db.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/db.rs), [prompts.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/llm/prompts.rs)
5. **동의와 파일 경계:** 파일별 동의가 모든 읽기 경로에 적용되는지, 심볼릭 링크·경로 바꾸기·큰 파일·잘못된 인코딩이 막히는지, 요약 결과가 지정 폴더 밖으로 나가지 않는지 검증한다. [sandbox.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/sandbox.rs), [watcher.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/watcher.rs)
6. **공급자 확장 비용:** 두 번째 공급자를 넣는 데 필요한 설정·오류 처리·모델 차이 흡수·기억 분리 정도를 점검한다. 이는 인터페이스 존재와 실제 다중 공급자 운영 간 차이를 확인하기 위한 것이다. [provider.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/llm/provider.rs), [ollama.rs](https://github.com/cskwork/pet-mochi/blob/main/src-tauri/src/llm/ollama.rs)

---

### 핵심 출처와 해석 기준

- [공식 소개 페이지](https://cskwork.github.io/pet-mochi/): 사용자가 접하는 현재 기능·설치 방식·로드맵. 일부 수치와 설명은 프로젝트 자체의 주장이다.
- [GitHub README](https://github.com/cskwork/pet-mochi): 현재 기능·아키텍처·제약의 1차 설명.
- [PRD](https://github.com/cskwork/pet-mochi/blob/main/PRD.md): 목표와 비목표. 계획 문구를 모두 출시 기능으로 해석하지 않았다.
- [PRODUCT.md](https://github.com/cskwork/pet-mochi/blob/main/PRODUCT.md): 대상 사용자와 배포 상태.
- [공개 소스](https://github.com/cskwork/pet-mochi/tree/main/src/lib/sim): 로컬 규칙·상태 계산·사건 문턱 확인. 이번 조사는 전체 코드 감사나 실사용 테스트가 아니다.
