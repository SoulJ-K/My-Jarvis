# Jarvis Pet

태어난 펫과 관계를 계속 유지하며 함께 성장하는 독립형 데스크톱 AI 비서 펫.

## 현재 단계

- **v0.1 기획 완료 / 문서 정합성 검수 완료 / 구현 미시작**
- PRD v0.1, Decision Log v0.1, Character & Growth Design v0.1 정리 완료. 세 문서의 범위와 표현을 교차 검수했다.
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
├── docs/
│   ├── Jarvis_Pet_PRD_v0.1.md
│   ├── Jarvis_Pet_Decision_Log_v0.1.md
│   └── Jarvis_Pet_Character_and_Growth_Design_v0.1.md
└── competitive/
    ├── Jarvis_Pet_Competitive_Analysis_v0.1.md
    ├── Jarvis_Pet_Competitive_Analysis_v0.2.md
    ├── deep-dives/
    │   ├── Desktop_Pet_Deep_Dive_v0.1.md
    │   ├── Miru_Deep_Dive_v0.1.md
    │   ├── NekoAI_Deep_Dive_v0.1.md
    │   └── Pet_Mochi_Deep_Dive_v0.1.md
    └── experience-logs/
        └── NekoAI_Experience_Log_v0.1.md
```

## 주요 문서와 읽는 순서

1. [PRD v0.1](docs/Jarvis_Pet_PRD_v0.1.md): 제품 비전, 사용자 경험, 첫 버전의 요구사항과 향후 방향.
2. [Character & Growth Design v0.1](docs/Jarvis_Pet_Character_and_Growth_Design_v0.1.md): 펫의 탄생, 돌봄, 관계, 성장 표현. v0.1 완료 기준은 PRD를 따른다.
3. [Decision Log v0.1](docs/Jarvis_Pet_Decision_Log_v0.1.md): 설계 원칙의 결정 이유와 확정·가설 상태.
4. [Competitive Analysis v0.2](competitive/Jarvis_Pet_Competitive_Analysis_v0.2.md): 경쟁제품 4종의 비교와 검증할 차별화 가설. [v0.1](competitive/Jarvis_Pet_Competitive_Analysis_v0.1.md)은 이전 버전이다.
5. [Deep Dives](competitive/deep-dives/): 제품별 근거와 세부 분석.
6. [Experience Logs](competitive/experience-logs/): 직접 써본 경험과 해석을 구분해 기록. [NekoAI 경험 기록](competitive/experience-logs/NekoAI_Experience_Log_v0.1.md)이 있다.

## 다음 작업

**Codex에서 v0.1 기술 설계 및 구현 계획 수립.** 위 세 핵심 문서를 기준으로 앱 구조, 상태·기록 저장, 알 → 부화 → 아기 흐름, 기본 비서 기능과 검증 순서를 정한다. 실제 코드 구현과 동작 검증은 그 다음 단계다.

**주의:** 첫 AI 제공자, 구체적인 저장 기술, 성장 조건 등 미정 사항은 임의로 확정하지 않는다. 문서의 가설과 실제 구현·검증 결과를 구분한다.
