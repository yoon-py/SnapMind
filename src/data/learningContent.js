import { sampleShortsPack } from "./sampleShortsPack";

export const learningPacks = [
  {
    id: "thinking-clearly",
    lang: "en",
    status: "ready",
    title: "The Art of Thinking Clearly",
    subtitle: "Why your brain tricks you into bad decisions",
    author: "Rolf Dobelli",
    category: "Psychology",
    description:
      "Dense ideas become short guided lessons. Learn one bias, review the takeaway, answer one practical question, and move on.",
    heroLine:
      "A reading pack that feels more like a five-minute workout than a chapter summary.",
    keyIdeaCount: 6,
    minutesPerIdea: "4-5 min",
    accent: "#C98706",
    icon: "psychology",
    coverLabel: "BOOK BITE",
    coverLines: ["THE ART OF", "THINKING", "CLEARLY"],
    generationSteps: [
      "Upload a source",
      "Split it into ideas",
      "Generate lesson cards",
      "Add practice questions",
      "Publish the pack"
    ],
    ideas: [
      {
        id: "survivorship-bias",
        title: "Survivorship Bias",
        duration: "5 min",
        icon: "flare",
        teaser:
          "Success stories are loud. The invisible failures usually tell the real story.",
        lessonCards: [
          {
            id: "survivorship-1",
            eyebrow: "Pattern spotting",
            title: "A founder copied the winners",
            body:
              "He studied only successful entrepreneurs and noticed that many had dropped out, worked from home, and taken huge financial risks early on.",
            support:
              "Because those stories were visible, he treated those traits like a formula."
          },
          {
            id: "survivorship-2",
            eyebrow: "What went wrong",
            title: "The failures never made the list",
            body:
              "Thousands of failed founders had tried the very same things, but they were no longer in view. The sample included only survivors.",
            support:
              "That turned common behavior into fake proof."
          },
          {
            id: "survivorship-3",
            eyebrow: "Daily application",
            title: "Visible winners distort your judgment",
            body:
              "Whenever advice comes from a small group of winners, ask which failures were filtered out before the story reached you.",
            support:
              "Missing data is often the most useful data."
          }
        ],
        summaryBullets: [
          "Visible success can hide a huge graveyard of failed attempts.",
          "Traits shared by winners are not automatically success causes.",
          "Always ask what is absent from the sample before copying a pattern.",
          "Use base rates, not just stories, when making a big decision."
        ],
        reflectionPrompt:
          "Where in your life are you copying a winner without seeing the full field?",
        practice: {
          question:
            "You want to open a restaurant because the busy ones in your city always seem packed. What are you missing?",
          options: [
            "The failed restaurants that closed and are no longer visible.",
            "The secret recipes that make those specific places successful.",
            "The fact that restaurants only win with social media marketing."
          ],
          correctIndex: 0,
          explanation:
            "The visible sample contains survivors. The closed restaurants disappeared, so your judgment is skewed toward the winners."
        }
      },
      {
        id: "confirmation-bias",
        title: "Confirmation Bias",
        duration: "4 min",
        icon: "travel-explore",
        teaser:
          "Once you pick a side, your brain starts hiring evidence like a defense lawyer.",
        lessonCards: [
          {
            id: "confirmation-1",
            eyebrow: "The trap",
            title: "You search to feel right",
            body:
              "After forming an opinion, most people stop searching for truth and start searching for support.",
            support:
              "Articles, comments, and examples that agree with us feel smart and efficient."
          },
          {
            id: "confirmation-2",
            eyebrow: "What it costs",
            title: "Contradictory evidence gets filtered out",
            body:
              "Disconfirming evidence feels annoying, so we downplay it, reinterpret it, or never click on it in the first place.",
            support:
              "The result is confidence without calibration."
          },
          {
            id: "confirmation-3",
            eyebrow: "Better move",
            title: "Actively hunt for disproof",
            body:
              "Before making a decision, ask what would convince you that your current view is wrong and then go looking for exactly that.",
            support:
              "A good decision process tries to break the idea before reality does."
          }
        ],
        summaryBullets: [
          "Humans naturally collect agreement and ignore contradiction.",
          "Feeling informed is not the same as being well tested.",
          "Disconfirming evidence is more valuable than supportive evidence.",
          "Create a rule that every important view must survive one serious challenge."
        ],
        reflectionPrompt:
          "What belief are you protecting right now instead of testing?",
        practice: {
          question:
            "You think remote work lowers team quality, so you only save examples of remote teams missing deadlines. What are you doing?",
          options: [
            "Building a balanced case with representative evidence.",
            "Falling into confirmation bias by collecting only supporting examples.",
            "Using survivorship bias because only big teams matter."
          ],
          correctIndex: 1,
          explanation:
            "You are selecting evidence that supports your original view instead of testing it against a fair set of counterexamples."
        }
      },
      {
        id: "sunk-cost-fallacy",
        title: "Sunk Cost Fallacy",
        duration: "4 min",
        icon: "savings",
        teaser:
          "Past effort feels like a reason to continue, even when the future no longer makes sense.",
        lessonCards: [
          {
            id: "sunk-1",
            eyebrow: "Why it happens",
            title: "We hate admitting a loss",
            body:
              "Time, money, and energy already spent create emotional pressure to keep going, even when quitting would be smarter.",
            support:
              "Stopping can feel like wasting the past, even though the past is already gone."
          },
          {
            id: "sunk-2",
            eyebrow: "The hidden question",
            title: "Only the future should matter now",
            body:
              "The real decision is not what you already invested. It is whether you would choose this path again from today, with what you know now.",
            support:
              "If the answer is no, the sunk cost is not a reason to continue."
          },
          {
            id: "sunk-3",
            eyebrow: "Practical reset",
            title: "Re-decide from zero",
            body:
              "Imagine a clean slate: would you buy this stock, keep this project, or stay in this plan if you were starting fresh today?",
            support:
              "That question weakens the emotional grip of old investment."
          }
        ],
        summaryBullets: [
          "Past investment is not a future justification.",
          "Quitting a bad path can be rational, not weak.",
          "Re-deciding from zero helps expose emotional attachment.",
          "Ask whether you would choose the same path again today."
        ],
        reflectionPrompt:
          "What are you still carrying only because you already paid for it?",
        practice: {
          question:
            "You have spent six months on a feature nobody wants. What is the best next question?",
          options: [
            "How can we justify all the effort we already spent?",
            "If we were starting today, would we still build this feature?",
            "Which teammate should defend the original plan?"
          ],
          correctIndex: 1,
          explanation:
            "That question shifts the decision from past cost to future value, which is the only part you can still control."
        }
      },
      {
        id: "availability-bias",
        title: "Availability Bias",
        duration: "5 min",
        icon: "bolt",
        teaser:
          "What is vivid in memory feels more common, more likely, and more important than it really is.",
        lessonCards: [
          {
            id: "availability-1",
            eyebrow: "Mental shortcut",
            title: "Easy recall becomes fake evidence",
            body:
              "Events that are recent, emotional, or dramatic come to mind quickly, so the brain mistakes recall speed for probability.",
            support:
              "The easier it is to remember, the more real and frequent it feels."
          },
          {
            id: "availability-2",
            eyebrow: "Where it shows up",
            title: "News coverage warps your sense of risk",
            body:
              "A heavily covered event can dominate your perception even when the actual odds are small compared with boring everyday risks.",
            support:
              "Your attention follows stories, not base rates."
          },
          {
            id: "availability-3",
            eyebrow: "Countermove",
            title: "Replace memory with numbers",
            body:
              "When a decision matters, stop asking what examples come to mind and start asking what the actual frequency data says.",
            support:
              "Numbers are slower, but they are usually calmer and more accurate."
          }
        ],
        summaryBullets: [
          "Vivid stories feel common even when they are rare.",
          "Memory is shaped by emotion, repetition, and media attention.",
          "Important decisions need rates, not impressions.",
          "Ask for the denominator whenever a scary example appears."
        ],
        reflectionPrompt:
          "Which risk feels huge mainly because it is easy to imagine?",
        practice: {
          question:
            "After seeing several posts about startup layoffs, you assume every tech company is about to collapse. Which bias is strongest here?",
          options: [
            "Availability bias because recent vivid examples feel universal.",
            "Sunk cost fallacy because layoffs are expensive.",
            "Halo effect because brands look trustworthy."
          ],
          correctIndex: 0,
          explanation:
            "Recent, memorable examples are dominating your estimate of how common the event really is."
        }
      },
      {
        id: "halo-effect",
        title: "Halo Effect",
        duration: "4 min",
        icon: "lightbulb",
        teaser:
          "One strong trait can spill over and color everything else you think about a person or brand.",
        lessonCards: [
          {
            id: "halo-1",
            eyebrow: "First impression",
            title: "One strength becomes total judgment",
            body:
              "When someone looks polished, confident, or successful in one area, we unconsciously assume they are strong in other areas too.",
            support:
              "The mind prefers one tidy story over a mixed picture."
          },
          {
            id: "halo-2",
            eyebrow: "Why it matters",
            title: "Admiration hides weak spots",
            body:
              "Teams can overlook bad processes, poor ethics, or weak reasoning because the person or company shines in one visible dimension.",
            support:
              "Style and reputation can blur evaluation."
          },
          {
            id: "halo-3",
            eyebrow: "Stronger evaluation",
            title: "Split the scorecard",
            body:
              "Judge communication, strategy, execution, and reliability separately instead of letting one strong impression decide everything.",
            support:
              "Separate categories reduce the spillover effect."
          }
        ],
        summaryBullets: [
          "A single positive trait can inflate unrelated judgments.",
          "Admiration often weakens critical thinking.",
          "Evaluate people and products by category, not overall glow.",
          "Structured scorecards beat vibes when stakes are high."
        ],
        reflectionPrompt:
          "Who gets extra credibility from you because they are strong in one visible area?",
        practice: {
          question:
            "A charismatic founder gives a brilliant keynote, so investors assume the company operations must also be strong. What is happening?",
          options: [
            "Confirmation bias because the investors like speeches.",
            "Halo effect because one positive trait is coloring unrelated judgments.",
            "Availability bias because conferences are memorable."
          ],
          correctIndex: 1,
          explanation:
            "The founder's presentation skill is spilling over into assumptions about operations, which are separate abilities."
        }
      },
      {
        id: "anchoring-effect",
        title: "Anchoring Effect",
        duration: "4 min",
        icon: "straighten",
        teaser:
          "The first number or idea you see becomes a reference point, even if it is arbitrary.",
        lessonCards: [
          {
            id: "anchoring-1",
            eyebrow: "The first pull",
            title: "Initial numbers stick",
            body:
              "An opening price, estimate, or target quietly frames the rest of the conversation. Later adjustments usually stay too close to that anchor.",
            support:
              "The brain starts from what it already saw and then moves only a little."
          },
          {
            id: "anchoring-2",
            eyebrow: "Why it survives",
            title: "Even bad anchors shape judgment",
            body:
              "The anchor does not need to be accurate. It only needs to appear first and feel plausible enough to enter the conversation.",
            support:
              "Once it is in the room, it influences every comparison that follows."
          },
          {
            id: "anchoring-3",
            eyebrow: "How to counter it",
            title: "Build your own reference before you negotiate",
            body:
              "Collect independent numbers, set a walk-away range, and write it down before hearing the first external offer.",
            support:
              "Pre-commitment protects your judgment from the first loud number."
          }
        ],
        summaryBullets: [
          "First numbers shape later judgments disproportionately.",
          "Anchors work even when they are weak or arbitrary.",
          "Independent prep lowers your exposure to external anchors.",
          "Write your own range before you hear someone else's."
        ],
        reflectionPrompt:
          "Which first number is still affecting a decision you are making?",
        practice: {
          question:
            "A recruiter opens salary talks with a low range, and every counteroffer you consider stays close to it. Which bias is pulling on you?",
          options: [
            "Availability bias because salaries are emotional.",
            "Anchoring effect because the first number framed the negotiation.",
            "Halo effect because recruiters seem professional."
          ],
          correctIndex: 1,
          explanation:
            "The first range became the reference point, pulling your later judgments toward it."
        }
      }
    ]
  },
  {
    id: "thinking-clearly-ko",
    lang: "ko",
    status: "ready",
    title: "명확하게 생각하는 기술",
    subtitle: "뇌가 나쁜 결정을 내리게 만드는 이유",
    author: "롤프 도벨리",
    category: "심리학",
    description:
      "복잡한 개념을 짧은 레슨으로 풀어냅니다. 하나의 편향을 배우고, 핵심을 정리하고, 실전 문제를 풀고 넘어가세요.",
    heroLine:
      "챕터 요약이 아니라 5분 두뇌 운동에 가까운 학습팩.",
    keyIdeaCount: 6,
    minutesPerIdea: "4-5분",
    accent: "#C98706",
    icon: "psychology",
    coverLabel: "북 바이트",
    coverLines: ["명확하게", "생각하는", "기술"],
    generationSteps: [
      "자료 업로드",
      "아이디어로 분리",
      "레슨 카드 생성",
      "연습 문제 추가",
      "팩 발행"
    ],
    ideas: [
      {
        id: "survivorship-bias",
        title: "생존자 편향",
        duration: "5분",
        icon: "flare",
        teaser:
          "성공 스토리는 요란하지만, 보이지 않는 실패가 진짜 이야기를 들려줍니다.",
        lessonCards: [
          {
            id: "survivorship-1",
            eyebrow: "패턴 인식",
            title: "성공한 사람만 따라 했다",
            body:
              "한 창업자가 성공한 기업가만 연구했더니, 많은 이가 중퇴하고, 집에서 일하며, 초기에 큰 재정적 위험을 감수했습니다.",
            support:
              "그 이야기들이 눈에 띄었기 때문에, 그는 그 특성을 성공 공식처럼 여겼습니다."
          },
          {
            id: "survivorship-2",
            eyebrow: "놓친 것",
            title: "실패는 목록에 없었다",
            body:
              "수천 명의 실패한 창업자도 똑같은 시도를 했지만, 더 이상 눈에 보이지 않았습니다. 표본에는 생존자만 남아 있었죠.",
            support:
              "그래서 흔한 행동이 가짜 증거로 둔갑했습니다."
          },
          {
            id: "survivorship-3",
            eyebrow: "일상 적용",
            title: "눈에 보이는 승자가 판단을 왜곡한다",
            body:
              "조언이 소수의 승자에게서 나왔다면, 그 이야기가 내게 도달하기 전에 어떤 실패가 걸러졌는지 물어보세요.",
            support:
              "빠진 데이터가 종종 가장 유용한 데이터입니다."
          }
        ],
        summaryBullets: [
          "눈에 보이는 성공 뒤에는 거대한 실패의 무덤이 숨어 있다.",
          "승자가 공유하는 특성이 자동으로 성공 원인이 되지는 않는다.",
          "패턴을 따라 하기 전에 표본에서 빠진 것이 무엇인지 항상 확인하라.",
          "큰 결정을 할 때는 이야기가 아니라 기저율을 사용하라."
        ],
        reflectionPrompt:
          "지금 전체를 보지 않고 승자만 따라 하고 있는 곳이 있나요?",
        practice: {
          question:
            "동네 맛집이 항상 붐비는 걸 보고 식당을 열고 싶어졌습니다. 무엇을 놓치고 있나요?",
          options: [
            "문을 닫아서 더 이상 보이지 않는 실패한 식당들.",
            "그 특정 식당을 성공시키는 비밀 레시피.",
            "식당은 SNS 마케팅으로만 성공한다는 사실."
          ],
          correctIndex: 0,
          explanation:
            "눈에 보이는 표본에는 생존자만 있습니다. 문 닫은 식당은 사라졌기에 판단이 승자 쪽으로 치우칩니다."
        }
      },
      {
        id: "confirmation-bias",
        title: "확증 편향",
        duration: "4분",
        icon: "travel-explore",
        teaser:
          "한 번 편을 정하면, 뇌가 변호인처럼 증거를 수집하기 시작합니다.",
        lessonCards: [
          {
            id: "confirmation-1",
            eyebrow: "함정",
            title: "옳다고 느끼려고 검색한다",
            body:
              "의견을 형성한 뒤, 대부분의 사람은 진실 탐색을 멈추고 지지 증거 탐색을 시작합니다.",
            support:
              "내 생각과 일치하는 글, 댓글, 사례가 똑똑하고 효율적으로 느껴집니다."
          },
          {
            id: "confirmation-2",
            eyebrow: "대가",
            title: "반대 증거가 걸러진다",
            body:
              "반증은 짜증나게 느껴져서, 우리는 그것을 축소하거나 재해석하거나 애초에 클릭하지 않습니다.",
            support:
              "결과는 교정 없는 확신입니다."
          },
          {
            id: "confirmation-3",
            eyebrow: "더 나은 방법",
            title: "적극적으로 반증을 찾아라",
            body:
              "결정을 내리기 전에, 현재 견해가 틀렸다면 무엇이 나를 설득할 수 있을지 묻고, 정확히 그것을 찾아보세요.",
            support:
              "좋은 의사결정 과정은 현실이 깨뜨리기 전에 아이디어를 먼저 시험합니다."
          }
        ],
        summaryBullets: [
          "인간은 자연스럽게 동의를 모으고 모순을 무시한다.",
          "잘 알고 있다는 느낌이 충분히 검증된 것과 같지 않다.",
          "반증이 지지 증거보다 더 가치 있다.",
          "중요한 견해에는 반드시 한 번의 진지한 도전을 거치는 규칙을 만들라."
        ],
        reflectionPrompt:
          "지금 시험하지 않고 보호하고 있는 믿음이 무엇인가요?",
        practice: {
          question:
            "원격 근무가 팀 퀄리티를 떨어뜨린다고 생각해서, 원격팀이 마감을 놓친 사례만 저장하고 있습니다. 무엇을 하고 있는 건가요?",
          options: [
            "대표적인 증거로 균형 잡힌 논거를 구축하는 중.",
            "지지하는 사례만 모아서 확증 편향에 빠진 것.",
            "큰 팀만 중요하니까 생존자 편향을 사용하는 중."
          ],
          correctIndex: 1,
          explanation:
            "공정한 반례와 비교하는 대신, 원래 견해를 지지하는 증거만 선택하고 있습니다."
        }
      },
      {
        id: "sunk-cost-fallacy",
        title: "매몰비용 오류",
        duration: "4분",
        icon: "savings",
        teaser:
          "과거의 노력이 계속할 이유처럼 느껴지지만, 미래가 더 이상 맞지 않을 때가 있습니다.",
        lessonCards: [
          {
            id: "sunk-1",
            eyebrow: "왜 발생하나",
            title: "손실을 인정하기 싫다",
            body:
              "이미 쏟은 시간, 돈, 에너지가 그만두는 것이 더 현명한 상황에서도 계속하라는 감정적 압박을 만듭니다.",
            support:
              "멈추면 과거를 낭비하는 느낌이 들지만, 과거는 이미 지나갔습니다."
          },
          {
            id: "sunk-2",
            eyebrow: "숨겨진 질문",
            title: "이제는 미래만 중요하다",
            body:
              "진짜 결정은 이미 투자한 것이 아닙니다. 지금 알고 있는 것으로 오늘부터 다시 시작한다면 이 길을 또 선택할 것인지입니다.",
            support:
              "답이 아니라면, 매몰비용은 계속할 이유가 아닙니다."
          },
          {
            id: "sunk-3",
            eyebrow: "실전 리셋",
            title: "제로에서 다시 결정하라",
            body:
              "백지상태를 상상해보세요: 오늘 새로 시작한다면 이 주식을 사겠습니까, 이 프로젝트를 유지하겠습니까, 이 계획에 머물겠습니까?",
            support:
              "그 질문이 과거 투자의 감정적 붙잡음을 약화시킵니다."
          }
        ],
        summaryBullets: [
          "과거 투자는 미래의 정당화가 아니다.",
          "나쁜 길을 그만두는 것은 약한 게 아니라 합리적일 수 있다.",
          "제로에서 다시 결정하면 감정적 집착이 드러난다.",
          "오늘 같은 길을 다시 선택할 것인지 스스로 물어라."
        ],
        reflectionPrompt:
          "이미 비용을 지불했다는 이유만으로 아직 짊어지고 있는 것이 있나요?",
        practice: {
          question:
            "아무도 원하지 않는 기능에 6개월을 쏟았습니다. 최선의 다음 질문은?",
          options: [
            "이미 쏟은 노력을 어떻게 정당화할 수 있을까?",
            "오늘 다시 시작한다면 이 기능을 여전히 만들 것인가?",
            "원래 계획을 어느 팀원이 방어해야 할까?"
          ],
          correctIndex: 1,
          explanation:
            "그 질문은 결정을 과거 비용에서 미래 가치로 전환합니다. 미래 가치만이 아직 통제할 수 있는 부분입니다."
        }
      },
      {
        id: "availability-bias",
        title: "가용성 편향",
        duration: "5분",
        icon: "bolt",
        teaser:
          "기억에 생생한 것이 실제보다 더 흔하고, 더 가능성 있고, 더 중요하게 느껴집니다.",
        lessonCards: [
          {
            id: "availability-1",
            eyebrow: "정신적 지름길",
            title: "쉬운 회상이 가짜 증거가 된다",
            body:
              "최근 일어났거나, 감정적이거나, 극적인 사건은 빠르게 떠오르기 때문에 뇌가 회상 속도를 확률로 착각합니다.",
            support:
              "기억하기 쉬울수록 더 실제적이고 빈번하게 느껴집니다."
          },
          {
            id: "availability-2",
            eyebrow: "어디에서 나타나나",
            title: "뉴스 보도가 위험 감각을 왜곡한다",
            body:
              "크게 보도된 사건은 실제 확률이 일상적 위험에 비해 작더라도 인식을 지배할 수 있습니다.",
            support:
              "관심은 이야기를 따르지, 기저율을 따르지 않습니다."
          },
          {
            id: "availability-3",
            eyebrow: "대응법",
            title: "기억을 숫자로 교체하라",
            body:
              "결정이 중요할 때, 어떤 사례가 떠오르는지 묻지 말고 실제 빈도 데이터가 무엇인지 확인하세요.",
            support:
              "숫자는 느리지만, 보통 더 차분하고 정확합니다."
          }
        ],
        summaryBullets: [
          "생생한 이야기는 드물어도 흔하게 느껴진다.",
          "기억은 감정, 반복, 미디어 관심에 의해 형성된다.",
          "중요한 결정에는 인상이 아니라 비율이 필요하다.",
          "무서운 사례가 나타나면 항상 분모를 확인하라."
        ],
        reflectionPrompt:
          "쉽게 상상할 수 있다는 이유만으로 크게 느껴지는 위험이 있나요?",
        practice: {
          question:
            "스타트업 정리해고 글을 여러 개 본 뒤, 모든 테크 기업이 곧 망할 것 같은 느낌이 듭니다. 가장 강하게 작용하는 편향은?",
          options: [
            "가용성 편향 — 최근의 생생한 사례가 보편적으로 느껴진다.",
            "매몰비용 오류 — 정리해고는 비용이 크다.",
            "후광 효과 — 브랜드가 신뢰할 수 있어 보인다."
          ],
          correctIndex: 0,
          explanation:
            "최근의 기억에 남는 사례가 실제 빈도 추정을 지배하고 있습니다."
        }
      },
      {
        id: "halo-effect",
        title: "후광 효과",
        duration: "4분",
        icon: "lightbulb",
        teaser:
          "하나의 강한 특성이 넘쳐서 사람이나 브랜드에 대한 다른 판단까지 물들입니다.",
        lessonCards: [
          {
            id: "halo-1",
            eyebrow: "첫인상",
            title: "하나의 강점이 전체 평가가 된다",
            body:
              "누군가가 한 분야에서 세련되고, 자신감 있고, 성공적으로 보이면, 우리는 무의식적으로 다른 분야에서도 강하다고 가정합니다.",
            support:
              "마음은 혼합된 그림보다 하나의 깔끔한 이야기를 선호합니다."
          },
          {
            id: "halo-2",
            eyebrow: "왜 중요한가",
            title: "감탄이 약점을 숨긴다",
            body:
              "팀은 사람이나 회사가 눈에 보이는 한 차원에서 빛나기 때문에 나쁜 프로세스, 빈약한 윤리, 취약한 추론을 간과할 수 있습니다.",
            support:
              "스타일과 명성이 평가를 흐릴 수 있습니다."
          },
          {
            id: "halo-3",
            eyebrow: "더 강한 평가",
            title: "평가표를 분리하라",
            body:
              "커뮤니케이션, 전략, 실행, 신뢰성을 하나의 강한 인상이 모든 것을 결정하지 않도록 각각 따로 평가하세요.",
            support:
              "분리된 카테고리는 파급 효과를 줄입니다."
          }
        ],
        summaryBullets: [
          "하나의 긍정적 특성이 관련 없는 판단을 부풀릴 수 있다.",
          "감탄은 종종 비판적 사고를 약화시킨다.",
          "사람과 제품을 전체 분위기가 아닌 카테고리별로 평가하라.",
          "구조화된 평가표가 이해관계가 클 때 감보다 낫다."
        ],
        reflectionPrompt:
          "눈에 보이는 한 분야에서 강하다는 이유로 추가 신뢰를 주고 있는 사람이 있나요?",
        practice: {
          question:
            "카리스마 있는 창업자가 훌륭한 키노트를 했고, 투자자들은 회사 운영도 탄탄할 것이라고 가정합니다. 무슨 일이 일어나고 있나요?",
          options: [
            "확증 편향 — 투자자들이 발표를 좋아해서.",
            "후광 효과 — 하나의 긍정적 특성이 관련 없는 판단을 물들이고 있다.",
            "가용성 편향 — 컨퍼런스가 기억에 남아서."
          ],
          correctIndex: 1,
          explanation:
            "창업자의 발표 능력이 별개의 역량인 운영에 대한 가정으로 번지고 있습니다."
        }
      },
      {
        id: "anchoring-effect",
        title: "앵커링 효과",
        duration: "4분",
        icon: "straighten",
        teaser:
          "처음 본 숫자나 아이디어가 기준점이 됩니다. 그것이 임의적이더라도.",
        lessonCards: [
          {
            id: "anchoring-1",
            eyebrow: "첫 번째 끌림",
            title: "처음 숫자가 고착된다",
            body:
              "시작 가격, 추정치, 목표가 조용히 나머지 대화를 프레이밍합니다. 이후 조정은 대개 그 앵커에 너무 가까이 머뭅니다.",
            support:
              "뇌는 이미 본 것에서 시작하여 조금만 움직입니다."
          },
          {
            id: "anchoring-2",
            eyebrow: "왜 사라지지 않나",
            title: "나쁜 앵커도 판단을 좌우한다",
            body:
              "앵커가 정확할 필요는 없습니다. 먼저 나타나고 그럴듯해 보이기만 하면 대화에 들어옵니다.",
            support:
              "일단 방에 들어오면, 이후 모든 비교에 영향을 미칩니다."
          },
          {
            id: "anchoring-3",
            eyebrow: "대응법",
            title: "협상 전에 내 기준을 만들어라",
            body:
              "독립적인 숫자를 모으고, 이탈 범위를 설정하고, 외부의 첫 제안을 듣기 전에 적어두세요.",
            support:
              "사전 결정이 첫 번째 큰 숫자로부터 판단을 보호합니다."
          }
        ],
        summaryBullets: [
          "첫 번째 숫자가 이후 판단에 불균형적으로 영향을 미친다.",
          "앵커는 약하거나 임의적이어도 작동한다.",
          "독립적인 준비가 외부 앵커에 대한 노출을 줄인다.",
          "상대방의 숫자를 듣기 전에 자신의 범위를 먼저 정하라."
        ],
        reflectionPrompt:
          "지금 내리고 있는 결정에 아직 영향을 미치는 첫 번째 숫자는 무엇인가요?",
        practice: {
          question:
            "리크루터가 낮은 연봉 범위로 대화를 시작했고, 당신이 생각하는 모든 역제안이 그 근처에 머뭅니다. 어떤 편향이 작용하고 있나요?",
          options: [
            "가용성 편향 — 연봉이 감정적이라서.",
            "앵커링 효과 — 첫 번째 숫자가 협상을 프레이밍했다.",
            "후광 효과 — 리크루터가 전문적으로 보여서."
          ],
          correctIndex: 1,
          explanation:
            "첫 번째 범위가 기준점이 되어 이후 판단을 그쪽으로 끌어당기고 있습니다."
        }
      }
    ]
  },
  sampleShortsPack,
];
