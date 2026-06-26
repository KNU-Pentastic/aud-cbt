import { create } from 'zustand';
import {
  api,
  streamMessage,
  streamOpening,
  ApiError,
  type SseEvent,
  type PromptTrace,
  type StageProgress,
  type UtteranceAnalysis,
} from '@/lib/api';
import { friendlyError, friendlyMessage } from '@/lib/errorMessages';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** 스트리밍 중인 어시스턴트 메시지 여부 */
  streaming?: boolean;
};

export type ConversationContext = 'session' | 'craving' | 'resu' | 'soma';

/**
 * 라이브 답변의 진단 정보(LLM_TRACE=on): 참고한 프롬프트(prompt) +
 * 주차/단계 진행도(progress) + 직전 환자 발화 분석(analysis).
 */
export type SessionTrace = {
  prompt?: PromptTrace;
  progress?: StageProgress;
  analysis?: UtteranceAnalysis;
};

export type ChatSession = {
  id: string; // 백엔드 conversation_id
  sessionNumber: number; // 백엔드 week_number (헤더 표시용)
  context: ConversationContext;
  messages: Message[];
  /** 사용자가 종료 버튼으로 직접 마쳤는지. true 면 입력을 닫는다(대화 종료). */
  isComplete: boolean;
  /**
   * LLM 이 이번 주 내용을 끝까지 진행해 '마칠 준비'가 됐는지(session_ready 신호).
   * 자동 종료가 아니다 — 입력은 그대로 열려 있어 계속 질문할 수 있고, 마무리하고
   * 싶을 때 사용자가 종료 버튼을 누르면 그때 isComplete 가 된다.
   */
  readyToComplete: boolean;
};

// 백엔드 응답 타입 (openapi.yaml 기준)
type ConversationOut = {
  conversation_id: string;
  context: ConversationContext;
  session_id: string | null;
  week_number: number | null;
  started_at: string;
};

type CurrentSessionInfo = {
  active_conversation_id: string | null;
  current_week: number;
  next_session_date: string | null;
  llm_locked: boolean;
};

type MessageOut = {
  message_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
};

type Paginated<T> = { items: T[]; pagination: unknown };

/** 새 대화 진입 시 보여주는 정적 환영 문구 (LLM 출력이 아닌 UI 안내). */
const GREETING =
  '안녕하세요. 오늘 대화에 함께해 주셔서 감사해요. 이 공간은 판단 없이 편하게 이야기 나눌 수 있는 곳이에요. 오늘 어떻게 지내셨나요?';

function greetingMessage(): Message {
  return {
    id: 'greeting',
    role: 'assistant',
    content: GREETING,
    createdAt: new Date().toISOString(),
  };
}

type StartKind = 'session' | 'craving';

// 같은 세션에서 오프닝 스트림이 이중 실행되지 않도록(StrictMode·재진입) 막는 가드.
const openingInFlight = new Set<string>();

type ChatState = {
  sessions: Record<string, ChatSession>;
  /** conversation_id → 라이브 트레이스(참고 프롬프트 + 진행도). LLM_TRACE=on 일 때 채워짐. */
  traces: Record<string, SessionTrace>;
  currentSessionId: string | null;
  isTyping: boolean;
  llmLocked: boolean;
  lockReason: string | null;
  error: string | null;
  /** 등급 A 감지 직후 화면이 P4로 이동하도록 신호 (이동 후 clearSafetyTrip 호출) */
  safetyTripped: boolean;
  cancelStream: (() => void) | null;

  /** 앱 진입 시 활성 대화가 있으면 복원, 없으면 새 세션/갈망 대화 시작 */
  startNewSession: (kind?: StartKind) => Promise<string | null>;
  /** 대화의 기존 메시지를 불러와 세션 구성 (내부용) */
  loadConversation: (
    conversationId: string,
    currentWeek: number,
    context: ConversationContext
  ) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => void;
  /** 코치가 먼저 거는 세션 오프닝을 스트리밍한다 (세션1 제외 주간 세션). */
  startOpening: (sessionId: string) => void;
  completeSession: (sessionId: string) => Promise<void>;
  clearSafetyTrip: () => void;
  clearError: () => void;
};

type ChatSet = (
  partial:
    | ChatState
    | Partial<ChatState>
    | ((state: ChatState) => ChatState | Partial<ChatState>)
) => void;

// 어시스턴트 메시지에 토큰을 누적/갱신 (sendMessage·startOpening 공유).
function upsertAssistant(
  set: ChatSet,
  sessionId: string,
  messageId: string,
  mutate: (m: Message) => Message
) {
  set((state) => {
    const s = state.sessions[sessionId];
    if (!s) return state;
    const exists = s.messages.some((m) => m.id === messageId);
    const messages = exists
      ? s.messages.map((m) => (m.id === messageId ? mutate(m) : m))
      : [
          ...s.messages,
          mutate({
            id: messageId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
            streaming: true,
          }),
        ];
    return { sessions: { ...state.sessions, [sessionId]: { ...s, messages } } };
  });
}

// SSE 이벤트 → 스토어 반영 (메시지 전송·오프닝 공유). assistantIdRef 로 현재
// 어시스턴트 메시지 id 를 추적한다. 오프닝은 safety/stage/session_ready 이벤트를
// 보내지 않지만, 같은 핸들러를 써도 무해하다(해당 case 가 안 들어올 뿐).
function makeOnEvent(
  set: ChatSet,
  sessionId: string,
  assistantIdRef: { current: string | null }
) {
  return (ev: SseEvent) => {
    switch (ev.event) {
      case 'start':
        assistantIdRef.current = ev.data.message_id;
        upsertAssistant(set, sessionId, ev.data.message_id, (m) => m);
        break;
      case 'token':
        if (assistantIdRef.current) {
          const id = assistantIdRef.current;
          upsertAssistant(set, sessionId, id, (m) => ({ ...m, content: m.content + ev.data.text }));
        }
        break;
      case 'safety_classified':
        if (ev.data.grade === 'A') {
          // 등급 A(자살·급성중독): LLM 잠금 + P4 강제 이동
          set({ llmLocked: true, lockReason: ev.data.event_type, safetyTripped: true });
        }
        break;
      case 'context_switched':
        set((state) => {
          const s = state.sessions[sessionId];
          if (!s) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...s, context: ev.data.to as ConversationContext },
            },
          };
        });
        break;
      case 'context_used':
        // 이 답변이 참고한 프롬프트 블록·phase·선택 모듈 (LLM_TRACE=on)
        set((state) => ({
          traces: {
            ...state.traces,
            [sessionId]: { ...state.traces[sessionId], prompt: ev.data },
          },
        }));
        break;
      case 'stage_progress':
        // 치료 주차/단계 진행도 (LLM_TRACE=on)
        set((state) => ({
          traces: {
            ...state.traces,
            [sessionId]: { ...state.traces[sessionId], progress: ev.data },
          },
        }));
        break;
      case 'utterance_analysis':
        // 직전 환자 발화의 구조화 분석 + 안전 분류 (LLM_TRACE=on)
        set((state) => ({
          traces: {
            ...state.traces,
            [sessionId]: { ...state.traces[sessionId], analysis: ev.data },
          },
        }));
        break;
      case 'session_ready':
        // LLM 이 이번 주 내용을 끝까지 진행했다는 '마칠 준비' 신호 — 자동 종료가
        // 아니다. 입력은 그대로 열어 두어 계속 질문할 수 있고, 마무리하고 싶을 때
        // 사용자가 종료 버튼을 누르면 그때 completeSession 으로 종료된다.
        set((state) => {
          const s = state.sessions[sessionId];
          if (!s) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...s, readyToComplete: true },
            },
          };
        });
        break;
      case 'error':
        // 쿼터 소진/레이트리밋 등은 백엔드가 구체 code 를 실어 보내므로 그에 맞춰 안내.
        set({ error: friendlyMessage(ev.data.code, ev.data.message) });
        break;
      case 'done':
        if (assistantIdRef.current) {
          const id = assistantIdRef.current;
          upsertAssistant(set, sessionId, id, (m) => ({ ...m, streaming: false }));
        }
        break;
    }
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  traces: {},
  currentSessionId: null,
  isTyping: false,
  llmLocked: false,
  lockReason: null,
  error: null,
  safetyTripped: false,
  cancelStream: null,

  startNewSession: async (kind: StartKind = 'session') => {
    set({ error: null });
    try {
      // 1) 현재 세션 상태 조회 — 활성 대화 / 잠금 여부 확인
      const info = await api.get<CurrentSessionInfo>('/me/conversations/current-session');
      if (info.llm_locked) {
        set({ llmLocked: true, lockReason: 'safety_lock', safetyTripped: true });
        return null;
      }
      // 서버가 잠금 해제 상태를 보고하면(의료진이 웹에서 해제했을 수 있음)
      // 로컬에 남아 있던 잠금 표시도 정리해 환자가 다시 대화할 수 있게 한다.
      if (get().llmLocked) {
        set({ llmLocked: false, lockReason: null });
      }

      // 2) 갈망 대화: 활성 갈망이 있으면 재사용, 없으면 생성 (백엔드 /craving 정책)
      if (kind === 'craving') {
        const conv = await api.post<ConversationOut>('/me/conversations/craving');
        await get().loadConversation(conv.conversation_id, info.current_week, 'craving');
        return conv.conversation_id;
      }

      // 3) 세션: 활성 대화가 있으면 그대로 이어가기 (백엔드는 세션 동시 1개)
      if (info.active_conversation_id) {
        const id = info.active_conversation_id;
        await get().loadConversation(id, info.current_week, 'session');
        return id;
      }

      // 4) 새 세션 생성 — 세션1(week 1)을 제외한 주간 세션은 코치가 먼저 말을 건다
      //    (AI 오프닝). 세션1은 기존처럼 정적 인사로 시작한다.
      const conv = await api.post<ConversationOut>('/me/conversations/sessions');
      const week = conv.week_number ?? info.current_week;
      const aiLed = conv.context === 'session' && week >= 2;
      const session: ChatSession = {
        id: conv.conversation_id,
        sessionNumber: week,
        context: conv.context,
        messages: aiLed ? [] : [greetingMessage()],
        isComplete: false,
        readyToComplete: false,
      };
      set((state) => ({
        sessions: { ...state.sessions, [session.id]: session },
        currentSessionId: session.id,
      }));
      if (aiLed) get().startOpening(session.id);
      return session.id;
    } catch (e) {
      set({ error: e instanceof ApiError ? friendlyError(e) : '세션을 시작할 수 없어요.' });
      return null;
    }
  },

  // 대화의 기존 메시지를 불러와 세션을 구성 (내부용)
  loadConversation: async (conversationId, currentWeek, context) => {
    const res = await api.get<Paginated<MessageOut>>(
      `/me/conversations/${conversationId}/messages?page=1&page_size=100`
    );
    const msgs: Message[] = res.items.map((m) => ({
      id: m.message_id,
      role: m.role,
      content: m.text,
      createdAt: m.created_at,
    }));
    // 세션1 제외 주간 세션인데 아직 메시지가 없으면(첫 진입·오프닝 중단 후 재진입)
    // 코치가 먼저 인사한다. 그 외(세션1·갈망·이미 대화 있음)는 정적 인사/원문을 유지한다.
    const aiLed = context === 'session' && currentWeek >= 2;
    const session: ChatSession = {
      id: conversationId,
      sessionNumber: currentWeek,
      context,
      messages: msgs.length > 0 ? msgs : aiLed ? [] : [greetingMessage()],
      isComplete: false,
      readyToComplete: false,
    };
    set((state) => ({
      sessions: { ...state.sessions, [conversationId]: session },
      currentSessionId: conversationId,
    }));
    if (msgs.length === 0 && aiLed) get().startOpening(conversationId);
  },

  sendMessage: (sessionId, content) => {
    const session = get().sessions[sessionId];
    if (!session || session.isComplete || get().isTyping) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      isTyping: true,
      error: null,
      sessions: {
        ...state.sessions,
        [sessionId]: { ...session, messages: [...session.messages, userMsg] },
      },
    }));

    const assistantIdRef = { current: null as string | null };
    const cancel = streamMessage(sessionId, content, {
      onEvent: makeOnEvent(set, sessionId, assistantIdRef),
      onError: (err: ApiError) => {
        // 대화가 외부에서(의료진 웹·다른 기기) 종료됐는데 로컬은 아직 진행 중인 채로
        // 전송하면 409 CONVERSATION_ENDED 가 온다. 자동 종료를 없애면서 '로컬 진행 중 /
        // 서버 종료' 창이 넓어졌으므로, 이 경우 로컬도 종료로 동기화해 입력을 닫고
        // 영어 원문 대신 안내 문구를 보여준다.
        if (err.code === 'CONVERSATION_ENDED') {
          set((state) => {
            const s = state.sessions[sessionId];
            return {
              isTyping: false,
              cancelStream: null,
              error: '이 대화는 이미 종료되었어요.',
              sessions: s
                ? { ...state.sessions, [sessionId]: { ...s, isComplete: true } }
                : state.sessions,
            };
          });
          return;
        }
        set({ isTyping: false, cancelStream: null, error: friendlyError(err) });
      },
      onComplete: () => {
        set({ isTyping: false, cancelStream: null });
      },
    });

    set({ cancelStream: cancel });
  },

  // 코치가 먼저 거는 세션 오프닝을 스트리밍한다(세션1 제외 주간 세션). 메시지 전송과
  // 같은 스트림 처리(makeOnEvent)를 재사용하되, 오프닝 실패는 환자에게 '알림 없이'
  // 정적 인사로 조용히 폴백한다(서버가 성공 시 어시스턴트 턴으로 저장하므로 재진입 시엔
  // 원문이 그대로 복원된다). 메시지 전송과 달리:
  //   - 서버가 보낸 in-band `error` 프레임을 공용 error 필드로 올리지 않는다(원 raw
  //     예외가 세션 첫 화면에 Alert 로 튀는 것을 막는다 — sendMessage 는 알려야 하므로 그대로).
  //   - 실패 시 부분 수신된(잘린) 어시스턴트 버블까지 정적 인사로 교체한다.
  startOpening: (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session || get().isTyping) return;
    if (openingInFlight.has(sessionId)) return; // 이중 실행 방지(StrictMode·재진입)
    openingInFlight.add(sessionId);
    set({ isTyping: true, error: null });

    const assistantIdRef = { current: null as string | null };
    const baseOnEvent = makeOnEvent(set, sessionId, assistantIdRef);
    let failed = false;

    // 어떤 식으로 끝나든(정상 완료·전송 실패) 가드를 정리하고 폴백 여부를 결정한다.
    // greetingFallback 이거나 메시지가 하나도 없으면(no-op done 등) 정적 인사로 교체한다.
    const finish = (greetingFallback: boolean) => {
      openingInFlight.delete(sessionId);
      set((state) => {
        const s = state.sessions[sessionId];
        if (!s) return { isTyping: false, cancelStream: null };
        const useGreeting = greetingFallback || s.messages.length === 0;
        return {
          isTyping: false,
          cancelStream: null,
          sessions: useGreeting
            ? { ...state.sessions, [sessionId]: { ...s, messages: [greetingMessage()] } }
            : state.sessions,
        };
      });
    };

    const rawCancel = streamOpening(sessionId, {
      onEvent: (ev) => {
        // 서버 in-band error 프레임은 알림으로 올리지 않고 실패로만 표시한다 —
        // 이어 오는 done 에서 finish(true) 로 정적 인사 폴백한다.
        if (ev.event === 'error') {
          failed = true;
          return;
        }
        baseOnEvent(ev);
      },
      onError: () => finish(true), // 전송/네트워크 실패도 조용히 폴백
      onComplete: () => finish(failed), // 실패 표시됐으면 폴백, 아니면 받은 오프닝 유지
    });

    // 취소(abort) 시엔 onComplete/onError 가 호출되지 않으므로(api 의 settle 설계),
    // 가드(openingInFlight)·isTyping 이 영구히 남지 않도록 직접 정리한다.
    const cancel = () => {
      openingInFlight.delete(sessionId);
      set({ isTyping: false, cancelStream: null });
      rawCancel();
    };

    set({ cancelStream: cancel });
  },

  completeSession: async (sessionId) => {
    const cancel = get().cancelStream;
    if (cancel) cancel();
    try {
      await api.post(`/me/conversations/${sessionId}/end`, { reason: 'completed' });
    } catch {
      /* 종료 실패해도 UI 는 종료 처리 (다음 진입 시 current-session 으로 재동기화) */
    }
    set((state) => {
      const s = state.sessions[sessionId];
      if (!s) return { isTyping: false, cancelStream: null };
      return {
        isTyping: false,
        cancelStream: null,
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, isComplete: true },
        },
      };
    });
  },

  clearSafetyTrip: () => set({ safetyTripped: false }),
  clearError: () => set({ error: null }),
}));
