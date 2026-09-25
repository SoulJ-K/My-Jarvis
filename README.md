# Jarvis Pet

태어난 펫과 관계를 계속 유지하며 함께 성장하는 독립형 데스크톱 AI 비서 펫.

- **GitHub:** [SoulJ-K/My-Jarvis](https://github.com/SoulJ-K/My-Jarvis) — 비공개 저장소
- **최종 작업 폴더:** `/Users/rkfrk/Desktop/My Jarvis`
- **현재 저장 대상:** 제품 기획·기술 설계 초안·경쟁 분석·연동 조사·협업 규칙. 실행 가능한 앱은 아직 없다.

## 현재 단계

- **v0.1 기획 정리 / 기술 설계 검토용 초안 작성 / 앱 구현·실기기 검증 미시작**
- PRD v0.1, Decision Log v0.1, Character & Growth Design v0.1 정리 완료. 세 문서의 범위와 표현을 교차 검수했다.
- Technical Design v0.1에 앱 구조, 데이터 모델, 작은 구현 단계와 검증 계획을 정리했다. 검토용 초안이며 최종 기술 구성을 확정한 것은 아니다.
- 첫 기술 검증은 **Electron + TypeScript로 macOS부터 진행**하기로 정했다(Decision Log D-035). React·SQLite 등의 채택과 Windows 동작은 아직 확정·검증하지 않았다.
- 경쟁제품 4종 심층분석 및 통합 경쟁분석 v0.2 완료
- NekoAI를 AI 연결 없이 사용한 경험과 관계 UX 인사이트 기록

여기서 `완료`는 기획 문서의 작성·검수를 뜻한다. 앱 기능의 구현이나 동작 검증을 뜻하지 않는다.

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
├── docs/
│   ├── Jarvis_Pet_PRD_v0.1.md
│   ├── Jarvis_Pet_Decision_Log_v0.1.md
│   ├── Jarvis_Pet_Character_and_Growth_Design_v0.1.md
│   └── Jarvis_Pet_Technical_Design_v0.1.md
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

## 다음 작업

**기술 설계 초안을 검토하고 첫 기술 검증의 실행 범위를 확인한다.** 다음 구현 후보는 macOS에서 Electron + TypeScript로 임시 알의 투명 표시·클릭 반응·드래그 이동·메뉴 종료와 다른 앱의 입력을 방해하지 않는지 확인하는 작은 검증이다. 첫 검증 방향의 선택은 코드 구현 시작 승인이 아니며, 실제 앱 구현·실기기 검증은 아직 시작하지 않았다.

**주의:** 첫 AI 제공자, 구체적인 저장 기술, 성장 조건 등 미정 사항은 임의로 확정하지 않는다. 문서의 가설과 실제 구현·검증 결과를 구분한다.
