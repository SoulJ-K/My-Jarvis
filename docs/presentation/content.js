// 발표 내용과 메모. 디자인과 조작은 styles.css와 app.js에서 관리합니다.
window.JARVIS_SLIDES = [
  {
    "id": "start",
    "title": "알림을 보고도,\n해야 할 일을 잊었습니다",
    "seconds": 60,
    "theme": "dark",
    "body": "\n<div class=\"hero-layout\">\n <div class=\"hero-copy\"><p class=\"project-name\">Jarvis Pet</p><h1>알림을 보고도,<br>해야 할 일을<br><em>잊었습니다</em></h1><p class=\"lead\">수업 입·퇴실 체크.<br>휴대폰과 Slack에서 알림을 받고도<br>“이따 해야지” 하고 넘겼습니다.</p></div>\n <figure class=\"hero-media\"><img class=\"capture\" src=\"../assets/desktop-companion.gif\" alt=\"작업 메모 옆에서 구슬로 노는 원본 외형의 자비스\" data-poster=\"media/companion.jpg\"><figcaption>함께 생활하며, 해야 할 일을 챙겨주는 데스크톱 펫</figcaption></figure>\n</div><p class=\"bottom-thought\">나를 챙기는 존재가 있다면 달라질까?</p>",
    "notes": "제가 이 프로젝트를 시작한 계기는 수업의 입·퇴실 체크였습니다. 모바일 웹에서 직접 눌러야 하는데 자꾸 잊었습니다. 처음에는 휴대폰 알람을 썼고, 나중에는 Slack 알림도 받았습니다. 그런데 알림을 보고도 “이따 해야지” 하고 넘기면 다시 잊었습니다.\n\n이 경험에서 알게 된 건, 저에게 알림 자체는 이미 충분했다는 점입니다. 알림을 받는 순간과 실제로 행동하는 순간 사이가 끊어져 있었습니다. 그래서 화면에 함께 머물면서 해야 할 일을 다시 챙겨주는 존재를 만들고 싶었습니다.\n\n지금 보이는 것이 Jarvis Pet입니다. 제가 키우는 작은 펫이, 함께 지내면서 저도 챙겨주는 경험을 목표로 합니다. 오늘은 기능뿐 아니라 왜 이런 구조를 선택했고, 실제로 쓰면서 무엇을 보완해야 한다고 느꼈는지 말씀드리겠습니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      }
    ],
    "caption": "실제 앱 촬영 · 별도 테스트 펫 · 촬영 앱에만 낮 시간 조건 적용 · 외형과 UI는 변경될 수 있음"
  },
  {
    "id": "hypothesis",
    "title": "내가 돌보던 펫이,\n나를 챙긴다면?",
    "seconds": 60,
    "theme": "paper",
    "body": "\n<div class=\"hypothesis\"><p class=\"big-question\">애착이 가는 존재의 알림에는<br><em>조금 더 귀를 기울이지 않을까?</em></p>\n<div class=\"principles\"><div><span class=\"num\">01</span><h3>펫</h3><p>다시 보고 싶고<br>말을 걸고 싶은 존재</p></div><div><span class=\"num\">02</span><h3>성장</h3><p>함께 지낸 시간과<br>관계가 쌓이는 과정</p></div><div><span class=\"num\">03</span><h3>비서</h3><p>일상의 부탁을 받고<br>해야 할 일을 챙기는 역할</p></div></div>\n<p class=\"statement\">“나를 위한 무언가”를 “나를 위한 누군가”처럼</p>\n<p class=\"caveat\">애착이 실제 행동을 돕는지는 앞으로 검증할 제품 가설입니다.</p></div>",
    "notes": "그러면 왜 또 하나의 알람이 아니라 펫일까요? 수업 초기에 본 작은 도마뱀 프로그램은 특별한 기능 없이 돌아다니기만 해도 사람들이 귀여워서 계속 사용했습니다. 반대로 제가 사용하던 알림 도구는 유용해도 쉽게 넘겨 버렸습니다.\n\n여기서 가설을 세웠습니다. 애착이 가는 존재가 나를 챙기면 조금 더 귀를 기울이지 않을까? 그래서 펫, 성장, 비서를 하나의 경험으로 연결했습니다. 펫은 다시 보고 싶은 존재이고, 성장은 함께 지낸 시간과 관계를 표현합니다. 비서는 그 관계 안에서 실제로 도움이 되는 역할입니다.\n\n처음에는 제가 알을 돌보고 이름을 붙입니다. 이후에는 같은 존재가 제가 할 일을 챙깁니다. 다만 귀여우면 반드시 행동이 바뀐다는 효과를 입증한 것은 아닙니다. 이 가설이 실제 사용에서도 성립하는지 확인하는 것이 프로젝트의 중요한 과제입니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      }
    ],
    "caption": ""
  },
  {
    "id": "architecture",
    "title": "펫의 생활과 맡긴 일, 둘 다 이어가기 위해",
    "seconds": 90,
    "theme": "paper",
    "body": "\n<div class=\"architecture-layout purpose-layout\"><div>\n<p class=\"purpose-intro\">내가 돌보는 펫에게 부탁하면, <b>그 일도 챙겨줍니다.</b></p>\n<div class=\"request-route\"><div>사용자의 부탁<small>놀이 · 돌봄 · 시간 알림</small></div><span aria-hidden=\"true\">→</span><div><b>앱 진행 관리자</b><small>요청을 확인하고 필요한 담당을 연결</small></div></div>\n<div class=\"purpose-branches\" aria-hidden=\"true\"><i></i><i></i><i></i></div>\n<div class=\"purpose-roles\">\n <section class=\"purpose-role pet-role\"><h3>AI가 없어도<br>먹고 쉬고 놀기</h3><p class=\"role-name\">Pet Brain<small>펫의 생활과 반응</small></p><p>현재 상태에 맞춰<br>행동·교감을 결정하고<br>남길 경험을 정합니다.</p></section>\n <section class=\"purpose-role time-role\"><h3>펫이 졸려도<br>알릴 시간 챙기기</h3><p class=\"role-name\">비서 기능<small>시간과 할 일</small></p><p>타이머·알림과<br>완료 여부 확인을<br>따로 관리합니다.</p></section>\n <section class=\"purpose-role save-role\"><h3>껐다 켜도<br>같은 펫·약속 유지</h3><p class=\"role-name\">저장 담당<small>상태와 경험 보관</small></p><p>펫의 상태·돌봄 경험과<br>맡긴 일을<br>기기에 기록합니다.</p></section>\n</div>\n<p class=\"purpose-close\">역할은 나누고, 사용자에게는 <b>한 펫의 경험</b>으로 보여줍니다.</p>\n</div><aside class=\"ambition-note\"><span class=\"section-label\">처음 만들고 싶었던 비서</span><h3>일에 맞는 AI를<br>펫이 스스로 선택</h3><p>생활은 Pet Brain이 이어가고,<br>필요한 능력은 AI로 더하려 합니다.</p><p class=\"current-direction\"><b>현재는 OpenAI부터 연결하는 방향</b><span>아직 미연동 · 자동 모델 선택은 미래 구상</span></p><dl><div><dt>Claude</dt><dd>외부 앱은 API 인증이 기본.<br>일부 허용 도구도 별도 과금 가능.</dd></div><div><dt>Gemini</dt><dd>공식 도구의 로그인 인증을 다른 앱이 재사용해 직접 접근하는 것은 금지.</dd></div><div><dt>OpenAI</dt><dd>조건에 맞는 오픈소스 앱의 ChatGPT 구독 연동 경로 안내.</dd></div></dl></aside></div>",
    "notes": "자비스는 제가 돌보는 펫에게 할 일을 부탁하면, 그 펫이 저도 챙겨주는 앱입니다. 이 경험을 만들려면 두 가지가 함께 돌아가야 했습니다. 펫은 먹고 쉬고 놀아야 하고, 맡긴 일은 정해진 때에 알려주고 끝났는지도 확인해야 합니다.\n\n그래서 책임을 나눴습니다. Pet Brain은 펫의 현재 상태와 일어난 일을 보고 다음 행동과 반응, 남길 경험을 정합니다. 외부 AI가 없어도 이 생활은 이어집니다. 비서 기능은 시간을 챙깁니다. 펫이 졸리거나 잠시 거리를 두더라도 알림 시각까지 감정에 따라 바뀌면 안 되기 때문입니다. 저장 담당은 상태와 약속을 기기에 남겨 앱을 다시 켜도 같은 펫과 일을 이어가게 합니다.\n\n맨 위의 진행 관리자는 부탁을 확인하고 필요한 담당을 연결합니다. 매번 모든 담당을 거치는 것은 아닙니다. 각각 다른 프로그램을 만든 것이 아니라, 한 앱 안에서 맡을 일을 구분한 것입니다. 화면과 외형을 바꾸더라도 이 생활 규칙과 기록은 유지하려고 했습니다.\n\n처음에는 펫이 일에 맞는 AI도 스스로 고르는 비서를 만들고 싶었습니다. 하지만 구독 계정을 외부 앱에서 사용하는 규칙은 서비스마다 다릅니다. Claude와 Gemini에는 제한이 있고, 현재는 공식 구독 연동 경로를 안내하는 OpenAI부터 검토합니다. 아직 연결이나 자동 모델 선택이 구현된 것은 아닙니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      },
      {
        "title": "기술 설계: 현재 실행 구조",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Technical_Design.md"
      },
      {
        "title": "Claude: 구독 인증과 외부 앱 규칙",
        "href": "https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account"
      },
      {
        "title": "Gemini CLI: 서비스 접근 규칙",
        "href": "https://geminicli.com/docs/resources/tos-privacy/"
      },
      {
        "title": "OpenAI: Sign in with ChatGPT",
        "href": "https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt"
      }
    ],
    "caption": "현재 역할을 요약한 구조 · 앱 종료·Mac 절전 중 정시 알림은 보장하지 않음 · AI 구독 정책 확인: 2026.10.08",
    "referenceNotes": "화면에서 필요한 부탁만 전달하는 창구가 Preload입니다. 화면은 저장 파일이나 운영체제를 직접 다루지 않고 앱 진행 관리자를 거칩니다. Pet Brain은 다음 상태·행동·남길 경험을 결정하고, 실제 저장과 화면 전달은 진행 관리자가 조율합니다. SQLite는 저장 담당이 사용하는 기기 안의 저장 도구입니다.\n\nAPI는 프로그램끼리 요청을 주고받는 통로입니다. 이미 구독한 AI라도 외부 앱에서 같은 구독 사용량을 자유롭게 쓸 수 있는 것은 아닙니다. Claude는 외부 앱에 API 인증을 안내하고, 일부 허용 도구도 별도 크레딧으로 청구할 수 있습니다. Gemini는 공식 명령줄 도구의 로그인 인증을 다른 앱이 재사용해 서비스에 직접 접근하는 것을 금지합니다. OpenAI는 조건에 맞는 오픈소스 앱의 ChatGPT 구독 연동을 안내합니다. 각 공식 문서 링크는 아래에 있습니다. Claude·Gemini도 공식 허용 조건이 맞으면 연결을 검토하려는 방향입니다.\n\nAI나 외형이 바뀌어도 같은 펫의 생활과 경험을 이어가는 것이 설계 방향입니다. 현재 AI 교체 기능을 검증했다는 뜻은 아닙니다. 앱 종료·Mac 절전 중 정시 알림을 보장하지는 않습니다."
  },
  {
    "id": "plain-architecture",
    "title": "“물 마시기”를 부탁하면, 이렇게 진행됩니다",
    "seconds": 60,
    "theme": "sage",
    "body": "\n<div class=\"journey\">\n<p class=\"journey-intro\">사용자가 부탁하거나 답하면, <b>앱 진행 관리자가 아래 처리를 연결합니다.</b></p>\n<div class=\"journey-step\"><div class=\"journey-trigger\"><span>01 · 부탁하기</span><h3>“물 마시기<br>20초 타이머”</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action time-action\"><span>비서 기능</span><h3>20초 뒤 알림 예약</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action save-action\"><span>저장 담당</span><h3>그 약속을 기기에 기록</h3></div></div>\n<div class=\"journey-step\"><div class=\"journey-trigger\"><span>02 · 시간이 되면</span><h3>“물 마실 시간이에요”</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action time-action\"><span>비서 기능 + 알림 화면</span><h3>알리고, 완료 응답 기다리기</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action pet-action\"><span>Pet Brain + 펫 화면</span><h3>남은 일을 몸짓으로 챙기기</h3></div></div>\n<div class=\"journey-step\"><div class=\"journey-trigger\"><span>03 · 아직 못 했다면</span><h3>“아직이에요.<br>5분 뒤에요”</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action time-action\"><span>비서 기능</span><h3>완료 처리 없이 재알림 예약</h3></div><span class=\"journey-arrow\" aria-hidden=\"true\">→</span><div class=\"journey-action save-action\"><span>저장 담당</span><h3>다음 약속을 기기에 기록</h3></div></div>\n<p class=\"journey-conclusion\">이 과정을, <b>내가 돌보던 같은 펫이 곁에서 이어갑니다.</b><small>완료는 사용자가 “했어요”라고 답해야 확인합니다. 다른 앱의 작업을 자동 감지하지 않습니다.</small></p>\n</div>",
    "notes": "그렇다면 이 담당들이 실제 부탁 하나를 어떻게 처리하는지, 물 마시기로 보겠습니다. 첫째, “물 마시기 20초 타이머”라고 부탁합니다. 앱 진행 관리자가 요청을 연결하면 비서 기능이 알릴 시간을 정하고, 저장 담당이 그 약속을 기록합니다.\n\n둘째, 시간이 되면 알려줍니다. 여기서 끝내지 않고 물을 마셨다는 응답을 기다립니다. 일정 시간 동안 확인하지 않으면 펫의 후속 행동도 이어집니다. 비서 기능은 시간이 됐는지와 일이 남았는지를 관리하고, Pet Brain 쪽 생활·반응 규칙과 화면은 그 상태를 몸짓으로 표현합니다. Pet Brain이 시간을 재는 것은 아닙니다.\n\n셋째, 아직 못 마셨다고 답하고 5분 뒤를 고릅니다. 비서 기능은 일을 완료로 끝내지 않고 다음 알림을 잡고, 저장 담당은 바뀐 약속을 남깁니다. 이때도 응답과 각 담당 사이를 진행 관리자가 연결합니다.\n\n이 모든 과정은 외부 AI의 답 없이 앱 안의 규칙으로 처리합니다. 저에게 중요한 경험은 내가 키우던 같은 펫이 곁에서 나를 챙겨준다는 것입니다. 다음 장에서 실제 화면을 보겠습니다.",
    "sources": [
      {
        "title": "기술 설계: 현재 실행 구조",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Technical_Design.md"
      }
    ],
    "caption": "실제 기능의 처리 흐름 요약 · 화면 문구는 이해를 위한 요약 · 후속 행동까지의 대기 조건은 생략 · 다음 장에서 실제 시연",
    "referenceNotes": "이 그림은 사용자가 경험하는 순서를 요약한 것이며 코드의 모든 호출을 표시한 그림은 아닙니다. 저장과 화면 반영도 앱 진행 관리자가 조율합니다. 실제 입력은 “물 마시기 20초 타이머”이고, “아직이에요”를 누른 뒤 재알림 선택지에서 “5분 뒤”를 고릅니다.\n\n후속 확인과 펫 행동 사이에는 실제 대기 조건이 있습니다. 즉시 모든 행동이 한 번에 나온다는 뜻은 아니며, 다음 장의 GIF는 대기 구간을 생략한 실제 앱 촬영입니다. 현재 정책에서는 미완료 상태가 새 식사·잠들기에 영향을 줍니다. 이 정책의 부담과 보완 제안은 7장에서 설명합니다."
  },
  {
    "id": "followup",
    "title": "방금 본 흐름을, 실제 자비스로 보면",
    "seconds": 90,
    "theme": "dark",
    "body": "\n<div class=\"demo-layout\"><figure class=\"demo-media\"><img class=\"capture\" src=\"../assets/reminder-follow-up.gif\" alt=\"물 마시기 20초 타이머 입력, 후속 확인, 아직이에요와 5분 뒤 선택\" data-poster=\"media/followup.jpg\"><figcaption>실제 앱 시연 · 23초</figcaption></figure><div class=\"demo-story matched-demo\"><p class=\"demo-coordinator\"><b>앱 진행 관리자</b>가 입력·응답과 각 담당의 처리를 연결합니다.</p><ol class=\"demo-phases\"><li><span class=\"phase-kicker\">01 · 부탁하기</span><h3>“물 마시기 20초 타이머”</h3><p><span class=\"role-tag time-tag\">비서 기능</span> 알림 예약 <span aria-hidden=\"true\">→</span> <span class=\"role-tag save-tag\">저장 담당</span> 약속 기록</p></li><li><span class=\"phase-kicker\">02 · 시간이 되면</span><h3>“물 마실 시간이에요”</h3><p><span class=\"role-tag time-tag\">비서 기능 + 알림 화면</span> 알림·완료 응답 기다리기</p><p><span class=\"role-tag pet-tag\">Pet Brain + 펫 화면</span> 남은 일을 몸짓으로 챙기기</p></li><li><span class=\"phase-kicker\">03 · 아직 못 했다면</span><h3>사용자: “아직이에요” → “5분 뒤”</h3><p><span class=\"role-tag time-tag\">비서 기능</span> 재알림 예약 <span aria-hidden=\"true\">→</span> <span class=\"role-tag save-tag\">저장 담당</span> 다음 약속 기록</p></li></ol><p class=\"demo-done\">“했어요”라고 답해야 <em>완료로 처리합니다.</em></p></div></div>",
    "notes": "앞 장의 세 단계를 실제 영상으로 보겠습니다.\n\n첫째, 부탁하기입니다. 사용자가 “물 마시기 20초 타이머”라고 입력합니다. 비서 기능이 알릴 시간을 정하고, 저장 담당이 그 약속을 기기에 기록합니다.\n\n[영상에서 입력과 예약 장면을 짚습니다.]\n\n둘째, 시간이 됐을 때입니다. 비서 기능과 알림 화면이 시간이 됐다고 알려줍니다. 알림이 떴다고 물을 마신 것은 아니므로 완료 응답을 기다립니다. 확인하지 않은 채 일정 시간이 지나면 펫이 몸짓으로도 챙깁니다. 이 표현은 Pet Brain 쪽의 생활·반응 규칙과 펫 화면이 맡습니다.\n\n[타이머 종료와 아기의 후속 확인 장면을 짚습니다.]\n\n셋째, 아직 못 했을 때입니다. 사용자가 “아직이에요”를 누르고 다시 알릴 시간으로 “5분 뒤”를 고릅니다. 그 선택에 따라 비서 기능이 다음 알림을 잡고, 저장 담당이 바뀐 약속을 기록합니다. 앱 진행 관리자는 이 전체 흐름에서 입력과 응답을 전달하고 필요한 처리를 연결하는 역할입니다. 시간을 고르는 것은 사용자이고, 재알림을 관리하는 것은 비서 기능입니다.\n\n영상은 이 재알림을 설정하는 장면까지입니다. 실제 5분 뒤 알림 장면은 포함하지 않았습니다. 사용자가 “했어요”라고 답해야 완료로 처리하며, 다른 앱의 작업 완료를 자동 감지하지 않습니다. 이 세 단계는 외부 AI 없이 앱 안의 규칙으로 처리합니다.",
    "sources": [
      {
        "title": "기술 설계: 현재 실행 구조",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Technical_Design.md"
      },
      {
        "title": "개발 기록: 확인 결과와 한계",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Development_Log.md"
      }
    ],
    "caption": "별도 테스트 펫 · 낮 시간 조건 · 실제 2분 대기 및 일부 조작 대기 생략 · 확대·노란 테두리·단계 설명은 편집 표시",
    "referenceNotes": "담당 구분: 사용자는 미완료 여부와 다시 알릴 시간을 선택합니다. 비서 기능은 선택한 시간으로 다음 알림을 정하고, 저장 담당은 그 결과를 보관합니다. 앱 진행 관리자는 응답 전달과 처리 순서, 저장·화면 반영을 조율합니다. Pet Brain은 시간 계산이나 예약 저장을 맡는 것이 아니라, 펫의 상태와 남은 일에 맞는 생활·반응 규칙을 담당합니다.\n\n시연은 실제 입력 → 타이머 종료 → 후속 확인 → “아직이에요” → “5분 뒤” 선택 흐름입니다. 5분이 지난 뒤 실제로 다시 알리는 장면까지 담은 영상은 아닙니다. 실제 2분 대기와 일부 조작 대기는 편집에서 생략했습니다. 노란 테두리와 설명은 조작을 보여주기 위한 편집 표시입니다.\n\n현재 재촉 규칙과 생활 보류의 부담은 7장에서 따로 설명합니다. 다음 알림까지 펫이 항상 평소 생활로 돌아가는 것은 현재 구현으로 약속하지 않습니다."
  },
  {
    "id": "scope",
    "title": "지금 되는 것과, 앞으로 만들 것",
    "seconds": 45,
    "theme": "paper",
    "body": "\n<div class=\"scope-layout\"><div class=\"scope-text\"><div><span class=\"section-label\">현재 구현</span><h3>알·부화·아기 생활<br>돌봄과 상태 이어가기<br>타이머·알림·후속 확인</h3></div><div class=\"later\"><span class=\"section-label\">미래 확장</span><p>아기 이후 성장 / 사용자 패턴 이해<br>복잡한 대화 / AI 선택과 작업 연결</p></div><p class=\"principle-line\">더 유능해져도,<br><b>실행 권한은 따로 허락받습니다.</b></p></div><div class=\"scope-media\"><figure><img class=\"capture\" src=\"../assets/egg-to-baby.gif\" alt=\"같은 알이 부화하고 자비스라는 이름을 얻는 실제 장면\" data-poster=\"media/hatch.jpg\"><figcaption>원본 외형 · 알에서 이름 붙이기까지</figcaption></figure><figure class=\"appearance-preview\"><img class=\"capture\" src=\"../assets/new-appearance-preview.png\" alt=\"별도 시험 중인 잎 친구와 날개 친구\"><figcaption>새 외형 두 후보 시험 중 · 부화 시 선택·저장 연결은 남음</figcaption></figure></div></div>",
    "notes": "방금 보신 시연을 포함해, 지금은 알에서 부화하고 이름을 붙여 아기로 생활하는 경험과 기본 시간 관리·후속 확인까지 구현했습니다. 돌봄 경험과 상태도 앱을 다시 켜면 이어집니다. 부화 영상은 같은 시험 개체가 이어지는 실제 앱 화면이고, 개발용 준비 기능을 사용해 대기 구간은 생략했습니다.\n\n아래의 잎 친구와 날개 친구는 별도의 외형 시험입니다. 시험 앱에 연결했지만, 부화 때 외형을 선택해 저장하는 연결은 아직 남아 있습니다. 아기 이후 성장, 사용자 패턴 이해, 여러 AI를 골라 복잡한 일을 하는 기능도 앞으로의 방향입니다.\n\n여기서 지킨 원칙이 있습니다. 성장하면서 이해하고 돕는 능력은 늘릴 수 있지만, 파일이나 시스템을 다룰 권한까지 자동으로 늘리지는 않습니다. 실행 권한은 사용자가 별도로 허용해야 합니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      },
      {
        "title": "캐릭터 설계: 생활·재촉 규칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Character_and_Growth_Design.md"
      }
    ],
    "caption": "부화: 테스트 개체·개발용 준비·대기 구간 생략 / 새 외형: 별도 비교 화면 확대 촬영 / 모두 개발 중"
  },
  {
    "id": "problems",
    "title": "직접 써보며 발견한 세 가지 보완점",
    "seconds": 90,
    "theme": "warm",
    "body": "\n<div class=\"problem-head\"><span>현재의 제약과 위험</span><span>다음 해결 방향 <small>아직 제안</small></span></div>\n<div class=\"problem-row\"><div><span class=\"issue-number\">01</span><h3>부탁하려면 문법을 알아야 합니다</h3><p>‘타이머’ 같은 정해진 단어가 필요합니다.</p></div><div><p>자주 쓰는 표현부터 늘리고,<br><b>애매하면 다시 확인하기</b></p></div></div>\n<div class=\"problem-row\"><div><span class=\"issue-number\">02</span><h3>일을 미루면 펫도 쉬지 못할 수 있습니다</h3><p>반복 미완료 응답으로 재촉이 강해지고,<br>새 식사·수면도 보류하는 규칙이 있습니다.</p></div><div><p>다음 알림까지 평소처럼 생활하거나,<br><b>재촉만 쉬는 선택 검토</b></p></div></div>\n<div class=\"problem-row\"><div><span class=\"issue-number\">03</span><h3>간식이 실제 파일 삭제로 이어집니다</h3><p>영구삭제와 넓은 접근 권한이 필요합니다.</p></div><div><p>별도 선택 기능으로 분리 검토,<br><b>시험 파일로 전체 과정 확인</b></p></div></div>\n<div class=\"risk-footer\"><img src=\"../assets/strong-follow-up.png\" alt=\"두 번째 미완료 응답 뒤 붉어진 원본 외형의 자비스\"><p>강한 재촉의 실제 모습<br><span>장기간 생활 보류는 예상 위험이며, 오삭제가 발생했다는 뜻은 아닙니다.</span></p></div>",
    "notes": "이렇게 만든 기능을 직접 쓰고 기록을 살펴보니, 보완할 점도 세 가지 보였습니다. 첫째, 편하게 부탁하려 해도 ‘타이머’ 같은 정해진 말을 알아야 합니다. 자주 쓰는 표현을 늘리고, 애매하면 “3분 타이머로 등록할까요?”라고 확인하는 방식부터 검토하고 싶습니다. 외부 AI를 먼저 넣어야만 해결되는 문제는 아닙니다.\n\n둘째, 반복해서 ‘아직이에요’라고 답하면 재촉 간격이 최소 15초까지 줄고, 새 식사와 잠들기도 보류합니다. 일을 오래 미루면 펫도 쉬지 못할 수 있습니다. 장시간 재현한 결과가 아니라 현재 규칙에서 예상되는 위험입니다. 다음 알림까지 평소처럼 지내거나 재촉만 쉬는 선택, 생활 보류의 최대 지속 조건을 검토해야 합니다. 이는 현재 정책을 바꾸는 제안입니다.\n\n셋째, 휴지통 간식은 실제 파일을 영구삭제하며 넓은 접근 권한이 필요합니다. 두 개 제한과 최종 확인은 이미 있지만, 별도 선택 기능으로 분리하고 권한 회수 방법을 안내하는 방안을 검토하고 싶습니다. Dock에서 시작해 삭제와 식사까지 이어지는 전체 과정도 시험 파일로 더 검증해야 합니다. 실제 오삭제가 발생했다는 뜻은 아닙니다.",
    "sources": [
      {
        "title": "개발 기록: 확인 결과와 한계",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Development_Log.md"
      },
      {
        "title": "캐릭터 설계: 생활·재촉 규칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Character_and_Growth_Design.md"
      },
      {
        "title": "결정 기록: 휴지통 간식과 재촉 정책",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Decision_Log.md"
      }
    ],
    "caption": "입력 제한: 확인됨 / 장기 생활 보류: 규칙에서 예상되는 위험 / 파일 삭제: 기능 자체의 위험 / 보완안: 미구현 제안",
    "referenceNotes": "직접 사용하고 기록을 검토하면서 세 가지 보완점을 찾았습니다. 첫 번째는 요청 문법입니다. 펫에게 편하게 부탁한다고 생각했는데, 아직은 ‘타이머’라는 단어처럼 정해진 표현을 알아야 합니다. 제목에 ‘알람’을 포함하는 입력도 별도 과제로 남았습니다. 과거 ‘구슬놀이’ 오해는 수정됐으므로 현재 오류로 세지 않았습니다. 자주 쓰는 표현부터 늘리고, 애매하면 “3분 타이머로 등록할까요?”라고 확인하는 방법을 검토하고 싶습니다. 외부 AI를 먼저 넣어야만 해결되는 문제는 아닙니다.\n\n두 번째는 재촉과 생활의 충돌입니다. 반복해서 ‘아직이에요’라고 답하면 재촉이 강해지고 간격은 최소 15초까지 줄어듭니다. 현재 규칙에서는 새 식사와 잠들기를 보류하고, 자고 있으면 깨웁니다. 일을 저녁까지 미루면 펫도 오래 쉬지 못할 수 있습니다. 장시간 재현한 결과가 아니라 규칙에서 예상되는 위험입니다. 사용자가 부담을 피하려고 하지 않은 일을 ‘했어요’로 답할 수도 있습니다. 다음 알림까지 평소처럼 지내거나 재촉만 쉬는 선택, 생활 보류의 최대 지속 조건을 검토할 필요가 있습니다. 이는 현재 정책을 바꾸는 제안입니다.\n\n세 번째는 휴지통 간식입니다. 최대 두 개 제한, 직접 선택과 최종 확인은 이미 있습니다. 그래도 실제 파일의 영구삭제이고 전체 디스크 접근 권한이 필요합니다. 오삭제가 발생했다는 뜻은 아닙니다. 선택 기능으로 분리하고 권한 회수 방법을 안내하는 방안을 검토하고, Dock에서 시작해 삭제와 식사까지 이어지는 전체 경로, 부분 실패와 앱 교체 후 권한을 시험 파일로 확인해야 합니다. 가상 간식을 기본으로 하는 방안도 제품 결정을 바꾸는 제안입니다."
  },
  {
    "id": "learning",
    "title": "만들면서 배운 점, 그리고 가장 어려웠던 질문",
    "seconds": 60,
    "theme": "dark",
    "body": "\n<div class=\"learning learning-first\"><div class=\"learnings\"><p><b>작동하는 기능 ≠ 편하게 쓰는 경험</b><span>부탁하기 어렵거나 재촉이 부담스럽다면,<br>실제 사용 흐름을 다시 살펴봐야 했습니다.</span></p><p><b>AI가 코드를 도와줘도, 판단은 제 몫</b><span>무엇을 만들고 무엇을 미룰지,<br>결과가 괜찮은지는 제가 결정해야 했습니다.</span></p></div><p class=\"section-label\">그리고 이 프로젝트에서 가장 어려웠던 부분은…</p><blockquote>기존 제품이 있는데,<br><em>왜 굳이 자비스여야 할까요?</em></blockquote><p class=\"reflection\">이 질문에 제가 답하지 못하면<br>프로젝트의 의미도 설명하기 어렵다고 생각했습니다.</p></div>",
    "notes": "이런 문제들을 확인하면서, 기능이 작동하는 것과 실제로 편하게 쓰는 것은 다르다는 걸 알게 됐습니다. 타이머가 정확해도 부탁하는 방법이 어렵고, 재촉을 잘해도 부담스럽다면 계속 쓰고 싶은 경험이 되기 어렵습니다. 그래서 구현 성공만 보고 끝내지 않고 실제 화면과 생활 흐름을 확인해야 했습니다.\n\n그 과정에서 AI가 코드 작성을 도와줘도 무엇을 만들지, 결과가 괜찮은지 판단하는 일은 제 몫이라는 것도 느꼈습니다. 처음의 목표와 현실적인 제약 사이에서 무엇을 남기고 미룰지도 제가 정해야 했습니다.\n\n그리고 이 프로젝트에서 제가 가장 어려웠던 부분은, “왜 굳이 자비스여야 할까요?”라는 질문에 답하는 일이었습니다. 이미 알람도 있고 데스크톱 펫도 있는데, 사람들이 자비스를 쓸 이유는 무엇일까 계속 생각했습니다. 제가 그 이유에 답하지 못하면 프로젝트의 의미도 설명하기 어렵다고 생각했기 때문입니다.\n\n지금 제가 찾은 답은 ‘내가 돌보던 같은 존재가 나를 챙겨주는 경험’입니다. 이제는 제가 생각한 이 차별점이 실제로 사용하는 사람에게도 의미가 있는지 확인하고 싶습니다.",
    "sources": [
      {
        "title": "프로젝트의 문제와 제품 가설",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      }
    ],
    "caption": ""
  },
  {
    "id": "next",
    "title": "함께 자라며, 나를 더 잘 돕는 비서로",
    "seconds": 45,
    "theme": "sage",
    "body": "\n<div class=\"closing vision-closing\"><p class=\"section-label\">Jarvis Pet이 향하는 방향</p><h1>처음엔 내가 돌보던 펫이,<br><em>점점 나를 이해하고 돕도록</em></h1><div class=\"vision-path\"><div><span class=\"vision-status\">현재 · 출발점</span><h3>곁에서 생활하는 펫</h3><p>알을 돌보고, 이름을 붙이고<br>작은 부탁을 맡깁니다.</p></div><div><span class=\"vision-status\">앞으로의 방향</span><h3>나를 이해하는 동반자</h3><p>함께 지낸 경험과 패턴을 바탕으로<br>필요한 도움을 알아갑니다.</p></div><div><span class=\"vision-status\">장기 비전</span><h3>일을 맡길 수 있는 비서</h3><p>일에 맞는 AI와 도구를 활용해<br>허용받은 범위에서 돕습니다.</p></div></div><p class=\"closing-line\">내가 키우던 <b>같은 존재</b>가, 함께 지낸 시간만큼 나를 더 잘 돕는 것.<br>그 경험을 자비스를 계속 쓸 이유로 만들고 싶습니다.</p><a class=\"repo-link\" href=\"https://github.com/SoulJ-K/My-Jarvis\" target=\"_blank\" rel=\"noopener noreferrer\">프로젝트와 실제 시연 보기 ↗ <span>github.com/SoulJ-K/My-Jarvis</span></a></div>",
    "notes": "그 질문에 대한 답을, 앞으로의 자비스에서 더 분명하게 만들고 싶습니다. 처음에는 제가 알을 돌보고 이름을 붙이지만, 함께 지낼수록 그 펫이 저를 이해하고 더 많은 일을 도와주는 비서로 자라는 것입니다.\n\n지금 만든 알과 아기 생활, 시간 관리와 후속 확인은 그 출발점입니다. 앞으로는 함께 지낸 경험과 사용자의 패턴을 바탕으로 필요한 도움을 알아가고, 일에 맞는 AI와 도구를 활용해 실제 작업도 도울 수 있도록 발전시키고 싶습니다. 물론 파일이나 시스템을 다루는 권한은 성장과 별개로 사용자가 허용해야 합니다.\n\n제가 계속 지키고 싶은 것은, 도움을 주는 존재가 바로 제가 키우던 그 펫이라는 점입니다. 함께 보낸 시간이 쌓일수록 나를 더 잘 돕는 동반자. 그 경험이 “왜 굳이 자비스여야 하는가?”에 대한 답이 되도록 만들어 가고 싶습니다. 감사합니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      }
    ],
    "caption": "알·아기 생활과 기본 시간 관리: 현재 구현 · 패턴 이해·선제적 도움·AI 선택과 작업 수행: 미래 확장"
  }
];
