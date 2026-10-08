// 발표 내용과 메모. 디자인과 조작은 styles.css와 app.js에서 관리합니다.
window.JARVIS_SLIDES = [
  {
    "id": "start",
    "title": "알림을 보고도,\n해야 할 일을 잊었습니다",
    "seconds": 60,
    "theme": "dark",
    "body": "\n<div class=\"hero-layout\">\n <div class=\"hero-copy\"><p class=\"project-name\">Jarvis Pet</p><h1>알림을 보고도,<br>해야 할 일을<br><em>잊었습니다</em></h1><p class=\"lead\">수업 입·퇴실 체크.<br>휴대폰과 Slack에서 알림을 받고도<br>“이따 해야지” 하고 넘겼습니다.</p></div>\n <figure class=\"hero-media\"><img class=\"capture\" src=\"../assets/desktop-companion.gif\" alt=\"작업 메모 옆에서 구슬로 노는 원본 외형의 자비스\" data-poster=\"media/companion.jpg\"><figcaption>함께 생활하며, 해야 할 일을 챙겨주는 데스크톱 펫</figcaption></figure>\n</div><p class=\"bottom-thought\">나를 챙기는 존재가 있다면 달라질까?</p>",
    "notes": "이 프로젝트는 수업 입·퇴실 체크를 자꾸 잊는 데서 시작했습니다.\n\n모바일 웹에 들어가 직접 눌러야 하는데, 다른 일을 하다 보면 놓치는 경우가 있었습니다. 그래서 휴대폰 알람도 맞추고, Slack 알림도 받았습니다.\n\n그런데 알림을 보고도 “이따 해야지” 하고 넘기면, 결국 다시 잊었습니다.\n\n저에게 필요한 건 알림을 하나 더 받는 게 아니라, 보고도 미뤄둔 일을 다시 챙기는 것이었습니다.\n\n그래서 화면에 계속 머물면서 제가 해야 할 일을 챙겨주는 존재가 있으면 어떨까 생각했습니다.\n\n그렇게 만들기 시작한 것이 지금 보이는 Jarvis Pet입니다. 오늘은 이 펫을 왜 만들었고, 어떻게 동작하며, 만들면서 어떤 고민을 했는지 말씀드리겠습니다.",
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
    "notes": "그런데 왜 펫으로 만들었을까요?\n\n수업 초기에 작은 도마뱀이 화면을 돌아다니는 프로그램을 봤습니다. 특별한 기능이 없어도, 사람들은 귀엽다는 이유로 계속 사용했습니다.\n\n반대로 제가 쓰던 알림 도구는 분명 유용한데도 쉽게 넘겨버렸습니다.\n\n여기서 이런 생각이 들었습니다. ‘내가 키우고 정이 든 펫이 알려주면, 그냥 알림창보다는 한 번 더 보지 않을까?’\n\n처음에는 제가 알을 돌보고, 부화를 기다리고, 이름을 붙입니다. 그렇게 함께 지내던 펫이 이제는 제가 해야 할 일도 챙겨주는 겁니다.\n\n펫을 키우는 경험과 비서의 도움을 따로 두는 게 아니라, 하나로 이어보고 싶었습니다.\n\n물론 이렇게 했을 때 정말 일을 덜 잊게 되는지는, 앞으로 사용하면서 확인해야 합니다.",
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
    "notes": "자비스는 화면에서 생활하는 펫이면서, 제가 맡긴 일을 챙겨주는 비서이기도 합니다.\n\n처음에는 일에 맞는 AI모델을 펫이 스스로 고르는 비서를 만들고 싶었습니다. 다만 기존 구독을 외부 앱에서도 그대로 쓸 수 있다고 가정하지 않고, 공식적으로 허용된 연결 방식을 먼저 확인하기로 했습니다. 현재는 OpenAI부터 검토하고 있고, 실제 AI 연결이나 자동 선택은 아직 구현하지 않았습니다.\n\n구조를 나눌 때 제가 중요하게 본 건, AI에 연결되지 않았다고 해서 펫의 생활까지 멈추면 안 된다는 점이었습니다.\n\n그래서 먹고 쉬고 반응하는 기본 생활은 Pet Brain이 맡고, 복잡한 대화나 작업에는 나중에 외부 AI를 더하는 방향으로 잡았습니다.\n\n또 펫이 졸리거나 기분이 좋지 않다고 약속한 알림까지 늦어지면 안 됩니다. 그래서 시간과 완료 여부 확인은 비서 기능이 따로 관리하도록 했습니다.\n\n저장 담당은 펫의 상태와 함께한 경험, 맡긴 일을 기기에 남깁니다. 앱을 다시 켜도 같은 펫과 생활을 이어가고, 나중에 사용하는 AI가 바뀌더라도 펫과 기록은 유지하고 싶었기 때문입니다.\n\n진행 관리자는 사용자의 요청을 받아 이 담당들을 연결합니다. 내부의 역할은 나눴지만, 사용자에게는 내가 키우던 한 펫이 계속 나를 챙기는 경험으로 보이도록 했습니다.",
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
    "title": "알림을 본 것과 일을 끝낸 것은 다릅니다",
    "seconds": 60,
    "theme": "sage",
    "body": "\n<div class=\"response-flow\">\n <div class=\"notice-flow\" aria-label=\"알림과 완료 확인 순서\"><span>알릴 시간 도착</span><span class=\"flow-arrow\" aria-hidden=\"true\">→</span><span>알림</span><span class=\"flow-arrow\" aria-hidden=\"true\">→</span><strong>완료 여부 확인</strong></div>\n <p class=\"response-label\">사용자의 응답에 따라</p>\n <div class=\"response-branches\">\n  <section class=\"response-branch response-done\"><h3>했어요</h3><p class=\"response-result\"><span aria-hidden=\"true\">↓</span>완료 처리</p></section>\n  <section class=\"response-branch response-pending\"><h3>아직이에요</h3><p class=\"response-result\"><span aria-hidden=\"true\">↓</span>다시 알릴 시간 선택</p>\n   <div class=\"nag-condition\"><h4>미완료 응답이 반복되면</h4><p>몸이 더 붉어지고 커지며,<br>강한 재촉 단계에서는<br>움직임으로도 주의를 끕니다.</p><small>첫 ‘아직이에요’는 약하게,<br>재알림에서도 다시 선택하면 강하게</small></div>\n  </section>\n  <section class=\"response-branch response-cancel\"><h3>취소할게요</h3><p class=\"response-result\"><span aria-hidden=\"true\">↓</span>해당 일의 후속 확인 종료</p></section>\n </div>\n <p class=\"response-rule\">응답 없이 시간이 지났다는 이유만으로 재촉을 강화하지 않습니다.</p>\n</div>",
    "notes": "여기서 제가 중요하게 구분한 건, 알림을 확인한 것과 실제로 일을 끝낸 것은 다르다는 점입니다.\n\n물 마실 시간이 됐다고 알려줬어도, 제가 정말 물을 마셨는지는 아직 모릅니다. 그래서 ‘했어요’, ‘아직이에요’, ‘취소할게요’라는 응답에 따라 다음 처리를 나눴습니다.\n\n아직 못 했다면 다시 알릴 시간을 정하고, 미완료 응답이 반복되면 펫의 몸 색과 크기가 달라집니다. 강한 재촉 단계에서는 화면 아래에서 뛰거나 커서 근처로 다가오기도 합니다.\n\n알림창만 다시 띄우는 것이 아니라, 곁에 있던 펫 자체가 눈에 들어오도록 표현한 것입니다.",
    "sources": [
      {
        "title": "기술 설계: 현재 실행 구조",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Technical_Design.md"
      },
      {
        "title": "캐릭터 설계: 생활·재촉 규칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_Character_and_Growth_Design.md"
      }
    ],
    "caption": "완료 여부는 사용자 응답으로 확인 · 다른 앱의 작업 완료를 자동 감지하지 않음",
    "referenceNotes": "현재 재촉 조건은 첫 “아직이에요” 응답에서 약한 단계, 재알림에서도 다시 “아직이에요”를 선택하면 강한 단계입니다. 약한 단계는 몸의 붉은 변화와 기본 크기 대비 10% 확대, 강한 단계는 20% 확대와 적극 행동을 사용합니다. 강한 단계의 행동은 화면 아래에서 통통 뛰기 또는 커서 근처로 따라가 바라보기이며, 개체의 선호에 따릅니다. 무응답이나 단순 시간 경과로 강도·주기를 높이지 않습니다.\n\n“했어요”는 해당 일을 완료 처리하고, “취소할게요”는 완료로 기록하지 않고 해당 일의 후속 확인을 종료합니다. 다른 일정이 남아 있다면 그 일정의 재촉 조건은 유지됩니다.\n\n완료 확인 카드는 최초 알림 처리 후 대기 조건 또는 사용자의 확인 조작에 따라 표시됩니다. 그림은 사용자 흐름의 요약이며 모든 화면이 즉시 연속으로 나타난다는 뜻은 아닙니다. 재알림을 기다리는 동안의 생활 보류와 보완 제안은 7장에서 설명합니다."
  },
  {
    "id": "followup",
    "title": "방금 본 흐름을, 실제 자비스로 보면",
    "seconds": 90,
    "theme": "dark",
    "body": "\n<div class=\"demo-layout\">\n <figure class=\"demo-media\"><img class=\"capture\" src=\"../assets/reminder-follow-up.gif\" alt=\"물 마시기 20초 타이머 입력, 후속 확인, 아직이에요와 5분 뒤 선택\" data-poster=\"media/followup.jpg\"><figcaption>실제 앱 시연 · 23초</figcaption></figure>\n <div class=\"demo-story\"><ol class=\"demo-moments\">\n  <li><h3><span>01</span>부탁하기</h3><p>“물 마시기 20초 타이머”</p></li>\n  <li><h3><span>02</span>후속 확인</h3><p>알림 이후, 일을 마쳤는지 확인</p></li>\n  <li><h3><span>03</span>다시 약속하기</h3><p>“아직이에요” <span aria-hidden=\"true\">→</span> “5분 뒤”</p></li>\n </ol></div>\n</div>\n<p class=\"demo-takeaway\">알림을 띄우는 데서 끝나지 않고, <em>완료 응답까지 이어갑니다.</em></p>",
    "notes": "실제 화면으로 보겠습니다.\n\n‘물 마시기 20초 타이머’를 입력하면 알림이 예약됩니다.\n\n시간이 지나면 알림이 나오고, 이후에는 일을 마쳤는지 확인합니다. 여기서 ‘아직이에요’를 누르고 ‘5분 뒤’를 선택하면, 완료로 끝내지 않고 다시 알리도록 남겨둡니다.\n\n보실 부분은 알림이 떴다는 사실이 아니라, 그 뒤에 제가 어떻게 응답했는지에 따라 다음 처리가 달라진다는 점입니다.",
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
    "referenceNotes": "기존 GIF를 그대로 사용합니다. 실제 입력 → 타이머 종료 → 후속 확인 → “아직이에요” → “5분 뒤” 선택까지 촬영했습니다. 실제 2분 대기와 일부 조작 대기는 생략했고, 노란 테두리와 단계 설명은 조작을 읽기 쉽게 하는 편집 표시입니다.\n\n첫 미완료 응답에 따른 약한 재촉 표현은 포함하지만, 재알림 이후 미완료 응답을 반복한 강한 재촉 움직임이나 실제 5분 뒤 재알림은 포함하지 않습니다. 강한 재촉의 정지 화면은 7장에서 보여줍니다.\n\n“완료 응답까지 이어갑니다”는 기능의 동작 원칙입니다. 이 영상에서 완료 응답을 선택한 장면까지 보여준다는 뜻은 아닙니다. 재알림을 기다리는 동안 항상 평소 생활로 돌아간다고 약속하지 않으며, 현재 정책의 부담과 보완 제안은 7장에서 설명합니다."
  },
  {
    "id": "scope",
    "title": "지금 되는 것과, 앞으로 만들 것",
    "seconds": 45,
    "theme": "paper",
    "body": "\n<div class=\"scope-layout\"><div class=\"scope-text\"><div><span class=\"section-label\">현재 구현</span><h3>알·부화·아기 생활<br>돌봄과 상태 이어가기<br>타이머·알림·후속 확인</h3></div><div class=\"later\"><span class=\"section-label\">미래 확장</span><p>아기 이후 성장 / 사용자 패턴 이해<br>복잡한 대화 / AI 선택과 작업 연결</p></div><p class=\"principle-line\">더 유능해져도,<br><b>실행 권한은 따로 허락받습니다.</b></p></div><div class=\"scope-media\"><figure><img class=\"capture\" src=\"../assets/egg-to-baby.gif\" alt=\"같은 알이 부화하고 자비스라는 이름을 얻는 실제 장면\" data-poster=\"media/hatch.jpg\"><figcaption>원본 외형 · 알에서 이름 붙이기까지</figcaption></figure><figure class=\"appearance-preview\"><img class=\"capture\" src=\"../assets/new-appearance-preview.png\" alt=\"별도 시험 중인 잎 친구와 날개 친구\"><figcaption>새 외형 두 후보 시험 중 · 부화 시 선택·저장 연결은 남음</figcaption></figure></div></div>",
    "notes": "전체 성장 단계와 AI 기능을 처음부터 모두 넣으면 범위가 너무 커진다고 봤습니다.\n\n그래서 첫 목표는 알을 돌보고, 부화를 보고, 아기와 생활하면서 작은 부탁을 맡기는 데까지로 정했습니다.\n\n먼저 이 작은 경험을 직접 써볼 수 있게 만들고, 펫과 함께 지내며 도움을 받는 흐름이 자연스러운지 확인하고 싶었습니다.\n\n지금은 알과 아기 생활, 타이머와 알림, 완료 여부 확인까지 구현했습니다. 앱을 다시 켜도 같은 펫과 상태, 돌봄 기록을 이어갑니다.\n\n위 영상은 시험용 펫의 부화 장면으로, 기다리는 구간은 줄였습니다. 아래 두 캐릭터는 새 외형 후보입니다. 별도 앱에서 시험하고 있고, 부화할 때 선택해서 저장하는 연결은 아직 남아 있습니다.\n\n아기 이후의 성장과 사용자 습관을 이해하는 기능, 외부 AI 연결은 앞으로 만들 부분입니다. 다만 펫이 더 똑똑해지더라도, 파일이나 시스템을 다루는 일은 사용자가 따로 허락해야 합니다.",
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
    "notes": "직접 사용하고 동작 방식을 다시 살펴보면서, 더 다듬어야 할 부분도 세 가지 찾았습니다.\n\n첫 번째는 부탁하는 방식입니다.\n\n펫에게 편하게 말하고 싶은데, 지금은 ‘타이머’처럼 정해진 단어를 써야 알아듣습니다. 사용자가 펫에게 맞춰서 말해야 하는 셈입니다.\n\n그래서 자주 쓰는 표현을 더 알아듣게 하고, 애매할 때는 “3분 타이머로 맞출까요?”라고 되묻는 방식으로 개선하고 싶습니다.\n\n두 번째는 재촉하는 방식입니다.\n\n지금은 ‘아직이에요’를 반복하면 재촉이 강해지고, 펫이 새로 밥을 먹거나 잠드는 것도 미루도록 되어 있습니다. 이대로라면 제가 일을 오래 미룰수록 펫도 오래 쉬지 못할 수 있습니다.\n\n여기서 더 강하게 재촉하는 것이, 더 잘 도와주는 것과 같지는 않겠다는 생각이 들었습니다. 제가 원한 건 일을 챙겨주는 동반자이지, 일을 미룰 때마다 부담을 주는 존재는 아니기 때문입니다.\n\n그래서 다시 알리기로 한 시간까지는 평소처럼 생활하거나, 재촉만 잠시 쉴 수 있게 하는 방법을 검토하고 있습니다.\n\n세 번째는 휴지통 간식입니다.\n\n휴지통에 있는 파일을 펫에게 간식처럼 주는 기능인데, 실제로는 파일을 영구삭제합니다. 또 휴지통 뿐 아니라 기기의 다른 영역에도 접근할 수 있는 넓은 권한이 필요합니다.\n\n파일을 직접 고르고 마지막에 확인하도록 해뒀지만, 귀여운 행동처럼 보인다고 가볍게 다룰 기능은 아니라고 생각했습니다.\n\n그래서 원하는 사람만 따로 켜서 쓰도록 분리하는 방향을 검토하고 있습니다. 파일 선택부터 삭제, 펫이 먹는 장면까지도 시험용 파일로 더 확인하려고 합니다.",
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
    "notes": "만들면서 ‘기능이 작동하는가’와 ‘계속 쓰고 싶은가’는 다른 문제라는 걸 느꼈습니다.\n\n타이머가 잘 돌아가도 부탁하기 불편하거나, 재촉이 부담스럽다면 계속 사용하기는 어려울 수 있습니다. 그래서 기능이 돌아가는지만 확인할 게 아니라, 실제로 쓰는 과정도 살펴봐야 했습니다.\n\nAI의 도움으로 코드를 작성하면서도, ‘만들 수 있는 기능’과 ‘지금 이 프로젝트에 필요한 기능’은 다르다는 걸 느꼈습니다.\n\n첫 범위를 어디까지로 정할지, AI가 없어도 어떤 경험은 유지해야 할지처럼, 무엇을 우선할지는 제가 정해야 했습니다. 알과 아기 단계부터 만들기로 한 것, 기본 생활을 외부 AI와 분리한 것이 그런 선택입니다.\n\n그리고 구현된 뒤에도 결과가 제가 원한 경험과 맞는지는 다시 확인해야 했습니다. 재촉 기능도 동작한다는 사실만으로 사용자에게 도움이 된다고 볼 수는 없었습니다.\n\n이 과정에서 제가 가장 어려웠던 질문은 이것이었습니다.\n\n‘이미 알람도 있고 데스크톱 펫도 있는데, 왜 굳이 자비스를 써야 할까?’\n\n제가 그 이유를 설명할 수 있어야, 이 프로젝트를 만드는 의미도 분명해진다고 생각했습니다.",
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
    "notes": "지금 제가 찾은 답은, ‘내가 돌보던 펫이 나를 챙겨주는 경험’입니다.\n\n지금은 시간을 알려주고, 일을 마쳤는지 묻는 단계입니다. 앞으로는 함께 지낸 경험과 사용자의 습관을 바탕으로 필요한 도움을 알아가고, AI와 도구를 활용해 허락받은 일도 도와주도록 만들고 싶습니다.\n\n이 변화가 단순히 기능이 추가되는 것이 아니라, ‘내가 키우던 펫이 이제 이런 일도 해주는구나’라고 느껴졌으면 좋겠습니다.\n\n함께 지낸 시간이 쌓일수록 나를 더 잘 돕는 동반자. 그 경험을 자비스를 계속 쓸 이유로 만들고 싶습니다.\n\n감사합니다.",
    "sources": [
      {
        "title": "PRD: 문제·가설·설계 원칙",
        "href": "https://github.com/SoulJ-K/My-Jarvis/blob/57811724f82008d6ce79aebb4694a0060957e65d/docs/Jarvis_Pet_PRD.md"
      }
    ],
    "caption": "알·아기 생활과 기본 시간 관리: 현재 구현 · 패턴 이해·선제적 도움·AI 선택과 작업 수행: 미래 확장"
  }
];
