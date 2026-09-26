# Jarvis Pet

태어난 펫과 관계를 계속 유지하며 함께 성장하는 독립형 데스크톱 AI 비서 펫.

- **GitHub:** [SoulJ-K/My-Jarvis](https://github.com/SoulJ-K/My-Jarvis) — 비공개 저장소
- **최종 작업 폴더:** `/Users/rkfrk/Desktop/My Jarvis`
- **현재 저장 대상:** 제품 기획·기술 설계·조사·협업 규칙과 첫 임시 알과 저장·복원 작업 브랜치. 최종 v0.1 제품은 아직 완성되지 않았다.

## 현재 단계

- **v0.1 기획 정리 / 기술 설계 검토용 초안 / macOS 임시 알 표시·클릭·이동 확인**
- PRD v0.1, Decision Log v0.1, Character & Growth Design v0.1 정리 완료. 세 문서의 범위와 표현을 교차 검수했다.
- Technical Design v0.1에 앱 구조, 데이터 모델, 작은 구현 단계와 검증 계획을 정리했다. 검토용 초안이며 최종 기술 구성을 확정한 것은 아니다.
- 첫 기술 검증은 **Electron + TypeScript로 macOS부터 진행**하기로 정했다(Decision Log D-035). SQLite는 이후 D-039에서 선택했다. React 채택과 Windows 동작은 아직 확정·검증하지 않았다.
- 2026-09-26에 **Electron 44.4.5·TypeScript 7.0.2를 프로젝트 안에 설치**하고 버전 명령의 실행을 확인했다(Decision Log D-037). 전역 설치는 하지 않았다. 이는 개발 도구 준비이며 펫 창이나 기능을 구현·검증한 것은 아니다.
- 이어서 사용자의 구현 승인으로 **임시 알 창을 실행**했다(D-038). 사용자가 실제 화면에서 표시·클릭 반응·드래그 이동을 확인했고, 자동 검사로 투명 배경과 제한된 화면 연결을 검증했다. 단계 1 전체 완료나 Electron 최종 채택을 뜻하지 않는다.
- 경쟁제품 4종 심층분석 및 통합 경쟁분석 v0.2 완료
- NekoAI를 AI 연결 없이 사용한 경험과 관계 UX 인사이트 기록

문서 검수, 자동 검사, 사용자 실기기 확인을 구분한다. **현재 통합 검사 브랜치에서는 SQLite 저장·복원과 작은 Pet Brain의 클릭 반응을 함께 구현하고 한 앱 흐름으로 자동 검사했다.** 개별 검토 뒤 사용자가 통합본 병합과 원본 반영을 승인했다. 통합 대상은 [PR #4](https://github.com/SoulJ-K/My-Jarvis/pull/4)이며 이전 PR #2·#3을 대체한다. Pet Brain은 대기·클릭 반응만 구현했다. 부화·아기 생활·비서 기능은 미구현이다.

## 담당 2: 작은 알 생활 확장 — 개별 검토용 브랜치

`codex/egg-care-life`에서 일반 마우스의 **바로 끌기 = 이동 / 잠깐 누른 뒤 밝아지면 좌우 문지르기 = 쓰다듬기**를 구현했다. 클릭과 쓰다듬기의 짧은 반응을 구분하며, 돌봄 사건·경과 시간을 SQLite에 함께 저장하고 앱 재시작 뒤 복원한다. 관계·성격 게이지, 돌봄 의무, 부화·아기·타이머·입력창은 추가하지 않았다.

`npm run typecheck`, `npm test`로 자동 검사 28개와 화면 연결 검사를 통과했다. 가짜 시계와 별도 Electron 앱·임시 DB를 사용했으며 원본 main·기존 실행 앱·실제 펫 DB는 변경하지 않았다. 검사 화면 캡처에서 알과 저장 실패 안내를 확인했다. 사용자 실제 마우스 조작감·절전·Windows·설치용 앱·장기간 보존은 미검증이다. 조작 수치는 잠정값이며 통합 후 사용자 확인이 필요하다.

검토 기준은 [D-042](docs/Jarvis_Pet_Decision_Log_v0.1.md), [기술 설계 단계 4](docs/Jarvis_Pet_Technical_Design_v0.1.md), [저장 ADR](docs/ADR-001-local-pet-storage.md)이다. GitHub 전송과 개별 draft PR까지만 진행하며 병합·원본 반영은 메인 작업이 수행한다. 아래 초기·통합 검사 기록은 당시 상태다. 화면에서 확인할 때는 통합 담당이 버전을 전환한 뒤 알을 잠깐 누르고 밝아지면 좌우로 문질러 부드러운 반응과 위치 유지를 확인한다. 기존 실행 앱을 임의 종료하거나 이 브랜치를 실제 DB로 실행하지 않는다.

## 핵심 원칙

- **게임 아님:** 펫과의 관계 및 비서 경험이 중심이다.
- **큰 비전, 작은 MVP:** 장기 구상과 첫 최소 기능 제품의 범위를 구분한다.
- **Pet Brain과 AI 분리:** 펫의 행동·감정·기억·성장과 AI 서비스를 분리한다.
- **여러 AI 연결 대비:** 여러 AI 제공자를 연결할 수 있게 고려하되, 실제 AI 연동은 후속 설계에서 한 제공자부터 검토한다.
- **Local-first & User-owned Memory:** 핵심 기억은 사용자 기기에 우선 저장하고 사용자가 소유한다.
- **Free-first:** 기존 AI 계정·구독을 공식 지원 범위에서 추가 API 과금 없이 활용하는 것을 우선한다.
- **Persistent Relationship / 관계의 지속성:** 태어난 펫을 교체하지 않고, 함께 키운 애착과 개체성을 이어간다.

## 폴더 구조

```text
My Jarvis/
├── README.md
├── AGENTS.md
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── scripts/copy-assets.mjs
├── src/
│   ├── main/             # 창·메뉴 막대·조작 요청 검증
│   ├── preload/          # 화면에 허용한 조작만 연결
│   ├── renderer/         # 임시 알 화면·클릭 반응
│   ├── pet/              # 저장·AI와 독립된 대기·반응 규칙
│   ├── shared/           # 화면 연결과 알 정보의 데이터 형태
│   └── storage/          # 앱 전용 SQLite 알 저장·복원
├── tests/               # 저장·앱 재시작·화면 연결 검사
├── docs/
│   ├── Jarvis_Pet_PRD_v0.1.md
│   ├── Jarvis_Pet_Decision_Log_v0.1.md
│   ├── Jarvis_Pet_Character_and_Growth_Design_v0.1.md
│   ├── Jarvis_Pet_Technical_Design_v0.1.md
│   └── ADR-001-local-pet-storage.md
├── competitive/
│   ├── Jarvis_Pet_Competitive_Analysis_v0.1.md
│   ├── Jarvis_Pet_Competitive_Analysis_v0.2.md
│   ├── deep-dives/
│   │   ├── Desktop_Pet_Deep_Dive_v0.1.md
│   │   ├── Miru_Deep_Dive_v0.1.md
│   │   ├── NekoAI_Deep_Dive_v0.1.md
│   │   └── Pet_Mochi_Deep_Dive_v0.1.md
│   └── experience-logs/
│       └── NekoAI_Experience_Log_v0.1.md
└── research/
    ├── OpenAI_Subscription_Reuse_Feasibility.md
    ├── Claude_Subscription_Reuse_Feasibility.md
    └── Gemini_Subscription_Reuse_Feasibility.md
```

## 주요 문서와 읽는 순서

1. [PRD v0.1](docs/Jarvis_Pet_PRD_v0.1.md): 제품 비전, 사용자 경험, 첫 버전의 요구사항과 향후 방향.
2. [Character & Growth Design v0.1](docs/Jarvis_Pet_Character_and_Growth_Design_v0.1.md): 펫의 탄생, 돌봄, 관계, 성장 표현. v0.1 완료 기준은 PRD를 따른다.
3. [Decision Log v0.1](docs/Jarvis_Pet_Decision_Log_v0.1.md): 설계 원칙의 결정 이유와 확정·가설 상태.
4. [Technical Design v0.1](docs/Jarvis_Pet_Technical_Design_v0.1.md): 구현 구조, 데이터 모델, 단계별 완료 조건과 테스트 계획을 담은 검토용 초안. 확정한 첫 검증 방향과 추천·미정 기술을 구분한다.
5. [Competitive Analysis v0.2](competitive/Jarvis_Pet_Competitive_Analysis_v0.2.md): 경쟁제품 4종의 비교와 검증할 차별화 가설. [v0.1](competitive/Jarvis_Pet_Competitive_Analysis_v0.1.md)은 이전 버전이다.
6. [Deep Dives](competitive/deep-dives/): 제품별 근거와 세부 분석.
7. [Experience Logs](competitive/experience-logs/): 직접 써본 경험과 해석을 구분해 기록. [NekoAI 경험 기록](competitive/experience-logs/NekoAI_Experience_Log_v0.1.md)이 있다.
8. [연동 타당성 조사](research/): OpenAI·Claude·Gemini의 기존 구독을 공식적으로 활용할 수 있는 범위와 제약. 구현 기준은 최신 PRD·Decision Log를 우선하며, 실제 연결 전 공식 조건을 다시 확인한다.

작업을 맡는 에이전트는 먼저 [협업 규칙](AGENTS.md)을 읽는다. 경쟁 분석과 연동 조사는 작성 시점의 참고 자료이며, 그 안의 아이디어나 과거 표현이 현재 v0.1 범위를 넓히지는 않는다.

## 파일별 역할과 작성 이유

| 파일 | 무엇을 담았는지 | 왜 만들었는지 |
|---|---|---|
| [README.md](README.md) | 프로젝트 소개, 현재 단계, 문서 안내, 기록 방식 | 새 작업자도 현재 상태와 기준 문서를 빠르게 찾게 하기 위해 |
| [AGENTS.md](AGENTS.md) | 문서 우선, 범위 제한, 검증, 위임, 원본 저장, Git 기록 규칙 | 작업과 세션이 바뀌어도 합의한 협업 방식을 유지하기 위해 |
| [.gitignore](.gitignore) | Git 기록에서 제외할 운영체제·임시·인증·개인 실행 데이터 경로 | 불필요한 파일과 실제 사용자 데이터의 실수 업로드를 줄이기 위해 |
| [package.json](package.json) | 프로젝트 정보와 Electron·TypeScript의 정확한 설치 버전 | 다른 프로젝트와 개발 도구 버전이 섞이지 않도록 이 프로젝트의 도구를 지정하기 위해 |
| [package-lock.json](package-lock.json) | 함께 설치되는 패키지의 정확한 버전·다운로드 출처·무결성 정보 | 다른 환경에서도 같은 의존성 구성을 다시 설치하기 위해 |
| [tsconfig.json](tsconfig.json), [화면 파일 복사](scripts/copy-assets.mjs) | TypeScript 검사·변환 설정과 HTML/CSS 복사 | 추가 구성 도구 없이 최소 앱을 실행하기 위해 |
| [앱 시작](src/main/index.ts), [창 관리](src/main/windows.ts) | 투명 창, 메뉴 막대 종료·위치 복원, 조작 요청 확인 | 데스크톱 펫의 창 동작을 먼저 검증하기 위해 |
| [화면 연결](src/preload/index.ts), [연결 타입](src/shared/window-api.d.ts) | 클릭 통과·드래그에 필요한 제한된 요청 창구 | 화면에 파일·명령 실행 권한을 주지 않고 창만 조작하기 위해 |
| [화면](src/renderer/index.html), [외형](src/renderer/styles.css), [반응](src/renderer/pet.ts) | 임시 타원형 알과 짧은 흔들림·마우스 처리 | 최종 그래픽 제작 전에 표시·클릭·이동을 확인하기 위해 |
| [기본 연결 검사](tests/egg-smoke.ts) | 실제 Electron 화면·투명 픽셀·요청 발신 창과 값 검사 | 화면 변경 시 기본 표시와 안전 경계가 깨졌는지 확인하기 위해 |
| [PRD v0.1](docs/Jarvis_Pet_PRD_v0.1.md) | 제품 원칙, 알→부화→아기 범위, 완료 기준, 미래 기능 | 무엇을 만들고 어디까지 완료로 볼지 정하기 위해 |
| [Decision Log v0.1](docs/Jarvis_Pet_Decision_Log_v0.1.md) | 결정, 이유, 확정·가설 상태와 후속 조치 | 나중에 선택의 배경과 변경 이유를 다시 확인하기 위해 |
| [Character & Growth Design v0.1](docs/Jarvis_Pet_Character_and_Growth_Design_v0.1.md) | 탄생·돌봄·감정·관계·성장의 표현 방식 | 제품 원칙을 사용자가 실제로 겪을 행동과 장면으로 구체화하기 위해 |
| [Technical Design v0.1](docs/Jarvis_Pet_Technical_Design_v0.1.md) | 기술 후보, 앱 구조, 데이터, 작은 구현 단계, 테스트와 위험 요소 | 구현 전에 책임·순서·미정 사항을 설명 가능한 계획으로 남기기 위해 |
| [경쟁 분석 v0.1](competitive/Jarvis_Pet_Competitive_Analysis_v0.1.md) | 공개 소개 자료 중심의 초기 제품 비교 | 처음 세운 비교 기준과 가설의 출발점을 보존하기 위해; 현재 통합 분석은 v0.2 |
| [통합 경쟁 분석 v0.2](competitive/Jarvis_Pet_Competitive_Analysis_v0.2.md) | 네 심층 분석의 종합 비교와 차별화 가설 | 중복 기능과 아직 검증할 기회를 구분하기 위해 |
| [Desktop Pet 심층 분석](competitive/deep-dives/Desktop_Pet_Deep_Dive_v0.1.md) | 데스크톱 비서·로컬 도구 실행 관점의 분석 | 장기적인 작업 수행 기능의 비교 근거를 남기기 위해 |
| [Miru 심층 분석](competitive/deep-dives/Miru_Deep_Dive_v0.1.md) | 동반 경험·기억·선제 반응의 공개 근거 | 사용자 곁에 머무는 경험과 업무 위임의 비교점을 찾기 위해 |
| [NekoAI 심층 분석](competitive/deep-dives/NekoAI_Deep_Dive_v0.1.md) | 펫 행동·AI 의존도·관계 경험의 공개 근거 | AI 없이도 성립하는 펫 경험을 비교하기 위해 |
| [Pet Mochi 심층 분석](competitive/deep-dives/Pet_Mochi_Deep_Dive_v0.1.md) | 생활 상태·로컬 동작·선택적 AI의 공개 근거 | 펫의 생활과 AI를 분리하는 설계를 비교하기 위해 |
| [NekoAI 사용 경험 기록](competitive/experience-logs/NekoAI_Experience_Log_v0.1.md) | AI 미연결 상태의 관찰·느낌, 후속 관찰 양식 | 공개 설명과 실제 경험을 구분하고 관계 UX의 근거를 남기기 위해 |
| [OpenAI 구독 재사용 조사](research/OpenAI_Subscription_Reuse_Feasibility.md) | 공식 Codex 작업 경로의 가능성과 일반 대화·구독 범위의 한계 | 구독을 일반 API 사용권으로 오해하지 않고 후속 연결을 판단하기 위해 |
| [Claude 구독 재사용 조사](research/Claude_Subscription_Reuse_Feasibility.md) | 제3자 앱의 구독 활용에 관한 공식 경로·제약 | 실제 사용 가능성과 제품 연동 허용 범위를 구분하기 위해 |
| [Gemini 구독 재사용 조사](research/Gemini_Subscription_Reuse_Feasibility.md) | 기존 구독·공식 도구·제3자 연결의 조건 | 추가 API 과금 없는 연결 가능성을 근거와 함께 판단하기 위해 |

## 변경 기록과 GitHub 보관 방식

커밋은 변경한 파일과 설명을 묶어 남기는 Git 기록이고, 푸시는 그 기록을 GitHub로 전송하는 작업이다. 파일 저장·커밋·푸시는 서로 다른 단계다.

- 이번 첫 업로드는 기획 기준, 기존 조사 자료, 기술 설계 초안과 협업 규칙을 보관하는 작업이다. 기존 기획 기준 커밋은 유지하고, 조사 자료 보존과 설계·저장소 정리는 의미에 따라 나눠 기록한다.
- 커밋 설명에 **무엇을 바꿨는지 / 왜 바꿨는지 / 무엇을 검증했는지 / 무엇이 미검증인지**를 남긴다. 기능이 아직 없는 문서 작업을 구현 완료로 표현하지 않는다.
- 중요한 결정의 이유는 기존 Decision Log, 현재 구조·구현 계획은 기존 기술 설계서에 반영한다. 파일별 목적은 위 표에서 확인한다.
- 작은 작업과 필요한 검증이 끝나면 원본 프로젝트에 통합한 뒤 기록·업로드할 시점을 제안한다. 워크트리에만 남은 파일을 최종 결과로 보고하지 않는다.
- 업로드 대상은 프로젝트 코드·문서다. `.DS_Store`, 인증정보, 실제 펫의 기억·대화 데이터, 임시·생성 파일은 제외한다. `.gitignore`는 제외 규칙이며 이미 기록된 비밀정보를 제거하거나 모든 민감정보를 자동 탐지하는 기능은 아니다.
- 이번 자료 정리에서는 로컬 문서 연결과 업로드 대상 파일을 검사한다. 외부 링크의 최신 유효성, 조사 결론의 최신성, 앱 기능·실기기 동작은 이번 업로드 검증 범위가 아니다.

## 개발 도구 준비 상태

- **설치·검증 환경:** macOS 26.6.2 / Apple Silicon(arm64), Node.js 24.21.0, npm 11.19.0.
- **설치 방식:** Electron 44.4.5와 TypeScript 7.0.2만 `devDependencies`(앱 개발에 필요한 도구 목록)에 정확한 버전으로 지정했다. 연관 패키지는 `package-lock.json`에 함께 기록한다. `node_modules/`는 내려받은 도구 폴더이며 Git 기록에서 제외된다.
- **확인한 것:** `npm ls --depth=0`, `./node_modules/.bin/tsc --version`, `./node_modules/.bin/electron --version` 성공. 설치 시 npm 취약점 조회 결과 0개이며, 모든 보안 문제가 없다는 보장은 아니다. Electron의 첫 버전 확인 때 실제 실행 바이너리 다운로드도 완료했다.
- **후속 구현:** 임시 알 창과 아래 실행·검사 명령을 추가했다. React·Vite·SQLite·Forge는 설치하지 않았다.
- **재설치:** 프로젝트 폴더에서 `npm ci`로 잠금 파일에 맞춰 다시 설치할 수 있다. 이 재설치 경로 자체는 아직 별도로 실행해 검증하지 않았다.

## 임시 알 실행과 확인 — 2026-09-26

프로젝트 폴더에서 다음 명령을 실행한다. `build`는 작성한 TypeScript를 앱이 실행할 JavaScript로 변환하고 화면 파일을 복사하는 과정이다. 결과인 `dist/`와 검사 이미지 `.local/`은 Git 기록에서 제외한다.

```sh
cd "/Users/rkfrk/Desktop/My Jarvis"
npm start
```

- 화면 오른쪽 아래의 알을 클릭하면 짧게 흔들린다. 누른 채 움직이면 이동한다.
- macOS 상단 메뉴 막대의 **알 → 알을 처음 위치로**에서 위치를 되돌리고, **알 → Jarvis Pet 종료**에서 종료한다. 이 브랜치에서는 재실행해도 같은 알을 복원한다. 화면 위치는 아직 저장하지 않으므로 초기 위치로 돌아온다.
- `npm run typecheck`: TypeScript 검사. `npm test`: 실제 Electron을 사용하는 앱 내부 연결·화면 검사. 후자는 다른 앱의 실제 클릭 통과·입력 보존을 대신 검증하지 않는다.

**검증 결과:** TypeScript 검사·빌드·자동 검사 통과. 자동 검사는 알 하나 표시, 화면의 Node.js 직접 접근 차단, 제한된 연결 제공, 입력 초점을 받지 않는 창 설정, 알 중심과 투명 모서리 구분, 잘못된 값·다른 창 요청 거절, 배경 투명 픽셀과 알의 불투명 픽셀을 확인했다. 생성한 앱 화면 이미지도 직접 확인했다. 사용자가 macOS 화면에서 **알 표시·클릭 시 흔들림·드래그 이동**을 확인했다.

**발견한 문제와 수정 확인:** 사용자가 입력칸에 글을 쓰다가 알을 클릭하면 이어 쓰기가 안 된다고 보고했다. 기존 `focusable: false` 설정 확인만으로 실제 입력 유지가 보장되지 않음을 확인했다. macOS에 한해 앱을 활성화하지 않는 `panel` 창을 적용했고 빌드·자동 검사는 다시 통과했다. 수정 후 사용자가 이 채팅 입력칸에서 `테스트` 작성 → 알 클릭 → 입력칸을 다시 누르지 않고 `123` 입력 시 글쓰기가 이어짐을 확인했다. 수정 후에도 알 클릭 시 흔들림·드래그 이동이 모두 된다고 사용자에게 재확인받았다. 다른 앱·상황 전반으로 확대해 검증한 것은 아니다.

**추가 사용자 확인:** 알 옆 투명 공간을 클릭했을 때 뒤에 있는 폴더가 정상 클릭됨을 확인했다. 이 사례의 클릭 통과를 확인한 것이며 모든 앱·좌표·배율에서 검증한 것은 아니다.

**알려진 지연 — 후속 개선:** 처음 위치로 복원되는 것은 사용자 확인했으나 메뉴 선택 후 약 1.3초 지연을 보고했다. 임시 진단 한 번에서 앱의 복원 처리 자체는 1.55ms였으며, 실제 화면 이동 완료까지의 시간과 원인은 미확정이다. 현재 작은 검증 단계에서는 추가 최적화를 보류하고 임시 진단 코드를 제거했다. 동작 확인과 반응 속도 문제를 구분하며 지연을 해결했다고 표시하지 않는다.

**미검증:** 메뉴 종료, 다른 앱·좌표 전반의 클릭 통과·키보드 입력 유지, 화면 가장자리·다중 모니터·배율·장시간 사용, 설치용 `.app` 포장, Windows. `panel`은 macOS의 여러 데스크톱 공간에 나타나는 특성이 있으므로 공간 전환·전체 화면에서의 표시도 확인해야 한다. 화면 조작 도구의 권한이 없어 Codex가 직접 운영체제 마우스로 검증하지는 못했다. 사용자 확인과 자동 검사 결과를 구분해 기록한다.

## 다음 작업

**저장·반응 통합본은 [PR #4](https://github.com/SoulJ-K/My-Jarvis/pull/4)를 기준으로 반영한다.** 최초 병합 보류 뒤 통합 검사와 사용자 직접 확인을 거쳤고, 이후 사용자가 병합·원본 반영을 승인했다. 후속 사용자 요청으로 `codex/egg-integration`에서 두 기능의 연결 충돌을 해결하고 통합 검사했다. 이전 병합 보류는 후속 사용자 승인으로 해제했다. 실행 중인 통합 앱은 유지하며 원본 코드 동기화와 실행 위치 변경은 구분한다.

작은 Pet Brain의 대기·클릭 반응까지 통합 검사했으며, 다음 기능은 알 생활의 후속 범위다. 단계 1의 메뉴 종료·설치용 앱·다중 모니터 검증 등은 여전히 남아 있으며, 저장 검사 성공을 단계 1 전체 완료로 표시하지 않는다.

현재 코드·기록은 원본 폴더에 저장했다. 최초 임시 알은 `6a05df5`로 로컬 기록했고, 후속 입력 유지 수정·검증 기록·협업 규칙을 같은 `codex/egg-window-prototype` 브랜치에 이어 기록한다. 사용자는 GitHub 작업 브랜치 전송·PR 생성·병합과 원본 로컬 `main` 동기화까지 승인했다. 전송 대상은 도구 설치 명세·앱 소스·검사·관련 문서이며 생성 파일과 실제 개인 데이터는 제외한다. 실제 전송·병합 결과는 GitHub PR과 Git 이력에서 확인한다.

**주의:** 첫 AI 제공자, 구체적인 저장 기술, 성장 조건 등 미정 사항은 임의로 확정하지 않는다. 문서의 가설과 실제 구현·검증 결과를 구분한다.


## 같은 알의 저장·복원 — 작업 브랜치 검증

2026-09-26, macOS 26.6.2 / arm64에서 Electron 44.4.5의 내장 SQLite를 사용했다. 추가 패키지는 없다. 자세한 선택 이유와 실패 처리 범위는 [ADR-001](docs/ADR-001-local-pet-storage.md)에 기록했다.

- 저장: 앱 전용 `userData/pet/pet.sqlite3`에 알의 고유 식별자·생성 시각·알 단계를 보존한다. 실제 경로는 Electron의 `app.getPath('userData')`를 따른다. 저장 파일은 프로젝트/GitHub에 포함하지 않는다.
- 화면: 같은 모양의 알이 표시되며, 내부 식별자는 재실행해도 같다. 이름·부화·아기 경험·반응 이력·화면 위치 저장은 아직 없다.
- 실패: 손상·빈 기존 파일·미지원 형식·저장 실패 때 기존 파일을 보존하고 앱 실행을 멈춘다. 자동으로 새 알을 만들지 않는다. 최초 저장 중단 뒤 남은 파일도 수동 복구 확인 대상이다.
- 검증: `npm run typecheck`, `npm test` 통과. 저장 검사 8개, 실제 Electron 시작 검사 5개 및 화면 연결·잘못된 요청 거절 검사. 임시 데이터로 실행하므로 사용 중인 펫 자료와 분리된다.
- 미검증: 실제 정전·디스크 소진, 오류 대화상자의 사용자 확인, 설치용 앱·Windows·장기간 보존. 삽입 실패는 오류 주입으로 검사했다.

코드 위치: [저장 담당](src/storage/pet-repository.ts), [알 정보 형태](src/shared/pet.ts), [앱 시작](src/main/index.ts). 검사는 [저장](tests/storage.test.ts), [앱 시작](tests/startup.test.ts), [화면 연결](tests/egg-smoke.ts), [검사 실행](scripts/test.mjs)로 나뉜다. `node_modules`는 기존 설치를 연결해 재사용했고 새 의존성은 설치하지 않았다.

확인 방법: 이 작업 폴더에서 `npm test`를 실행하면 같은 식별자의 재실행 복원과 오류 시 원본 보존 결과를 볼 수 있다. `npm start`로 실제 알을 띄우는 확인은 기존 원본 앱 종료와 새 버전 전환을 합의한 뒤 진행한다. 이번 작업에서는 원본 앱을 종료하거나 새 알 창을 사용자 화면에 띄우지 않았다.


## 저장 + Pet Brain 통합 검사 — 2026-09-26

개별 검사만으로 두 기능이 함께 동작한다고 판단할 수 없다는 사용자 지적에 따라, 저장 PR #2의 `2d2fd59`와 Brain PR #3의 `b0a380d`를 `codex/egg-integration`에 함께 구성했다. 원본과 기존 두 작업 브랜치는 변경하지 않았다. 창 생성 시 저장된 알 정보를 받는 방식, 화면 조회·상태 알림, 검사 실행 명령과 창 재생성 검사를 연결했다.

`npm run typecheck`, `npm test`, `git diff --check`를 통과했다. 총 규칙 검사 4개 + 저장 검사 8개 + 실제 Electron 앱 시작·통합 검사 7개 = 19개와 화면 연결 검사를 실행했다. 통합 시나리오는 아래와 같다.

1. 새 저장소에 알 생성 → 실제 페이지 클릭 입력 → Brain 반응·화면 흔들림 확인 → 페이지 다시 읽기 → 같은 알·반응 상태 유지 → 대기 복귀.
2. 앱 완전 종료 → 재실행 → 식별자·생성 시각·단계 동일, 임시 반응은 대기에서 시작 → 페이지 재클릭 정상 반응. 반응 전후 SQLite 파일 내용도 동일함을 확인.
3. 반응 중 앱 강제 종료 → 재실행 → 같은 알을 대기 상태로 복원 → 재클릭 정상 반응.
4. 통합된 앱에서도 중복 실행, 손상·쓰기 실패 시 창 미생성 및 원본 보존, 다른 창 요청 거절과 창 재생성 검사를 통과.

클릭은 숨긴 Electron 창의 `sendInputEvent`로 실제 페이지의 마우스·포인터 처리와 화면 연결을 거쳐 전달했다. 사용자 운영체제 커서를 움직이거나 원본 앱을 종료하지 않았다. 따라서 **두 기능의 결합된 앱 동작은 자동 검증**, 바탕화면에서 사용자가 실제 마우스로 조작하는 경험·설치용 앱·Windows·장시간은 여전히 미검증이다. 기존 개별 PR의 미통합 기록은 해당 작성 시점의 결과이며 이 절이 후속 통합 검사 결과다.


**일반 실행 시작 경로 수정 — 2026-09-26:** 사용자 수동 확인을 위해 `npm start`로 실행했을 때 `require.main === module` 조건 때문에 초기화가 호출되지 않는 문제를 확인했다. 이전 검사 도우미가 초기화 함수를 직접 불러 시작 파일의 누락을 놓쳤다. `src/main/index.ts`는 초기화를 항상 호출하고 실제 초기화 함수는 `src/main/app.ts`로 분리했다. 검사도 실제 시작 파일을 불러오도록 바꾸고 화면 표시·검사 콜백만 대체한다. 수정 후 타입 검사·19개 검사·화면 연결 검사가 통과했고, 일반 실행 명령의 정상 시작 메시지와 앱 전용 알 저장 파일을 확인했다. 사용자 직접 클릭·종료·재실행의 후속 확인은 아래에 구분한다.


**사용자 직접 확인 — 2026-09-26:** 일반 실행한 통합본에서 사용자가 알 클릭 후 흔들림·대기 복귀를 확인하고 메뉴로 종료했다. Codex가 다시 일반 실행한 뒤 저장된 식별자·생성 시각·단계의 종료 전후 비교값이 일치하고 알이 1개임을 읽기 전용으로 확인했다. 이어 사용자가 복원된 알도 클릭하면 흔들렸다가 멈춘다고 확인했다. 이로써 이 macOS 환경의 클릭 반응 → 메뉴 종료 → 같은 알 복원 → 재클릭 반응 흐름을 사용자 확인과 저장 자료 대조로 검증했다. 식별번호 원문이나 실제 펫 데이터는 문서·GitHub에 기록하지 않았다. 드래그·입력 유지·클릭 통과의 이번 통합본 재확인, 설치용 앱·Windows·장기간 보존은 이 확인에 포함하지 않는다. 실행 중인 앱은 통합 워크트리 버전이며 원본 코드 반영·main 병합은 아직 하지 않았다.


**병합 승인 — 2026-09-26:** 사용자 요청으로 기존 PR #2·#3을 닫고 통합 PR #4를 병합한 뒤 원본 main을 동기화한다. 앞선 보류 기록은 당시 상태이며 현재 승인은 이를 대체한다. 실제 병합 결과는 [PR #4](https://github.com/SoulJ-K/My-Jarvis/pull/4)와 Git 이력에서 확인한다. 원본의 위치 복원 지연·SQLite 선택 기록은 통합본에서 보존하며, 이전 다음 단계 안내는 최신 검증 상태로 갱신했다. 기존 브랜치와 실행 중인 통합 앱은 삭제·종료하지 않는다.
