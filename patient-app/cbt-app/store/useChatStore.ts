import { create } from 'zustand';
import { api, streamMessage, ApiError, type SseEvent } from '@/lib/api';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** 스트리밍 중인 어시스턴트 메시지 여부 */
  streaming?: boolean;
};

export type ConversationContext = 'session' | 'craving' | 'resu' | 'soma';

export type ChatSession = {
  id: string; // 백엔드 conversation_id
  sessionNumber: number; // 백엔드 week_number (헤더 표시용)
  context: ConversationContext;
  messages: Message[];
  isComplete: boolean;
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

type ChatState = {
  sessions: Record<string, ChatSession>;
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
  completeSession: (sessionId: string) => Promise<void>;
  clearSafetyTrip: () => void;
  clearError: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
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

      // 4) 새 세션 생성
      const conv = await api.post<ConversationOut>('/me/conversations/sessions');
      const session: ChatSession = {
        id: conv.conversation_id,
        sessionNumber: conv.week_number ?? info.current_week,
        context: conv.context,
        messages: [greetingMessage()],
        isComplete: false,
      };
      set((state) => ({
        sessions: { ...state.sessions, [session.id]: session },
        currentSessionId: session.id,
      }));
      return session.id;
    } catch (e) {
      set({ error: e instanceof ApiError ? e.message : '세션을 시작할 수 없어요.' });
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
    const session: ChatSession = {
      id: conversationId,
      sessionNumber: currentWeek,
      context,
      messages: msgs.length > 0 ? msgs : [greetingMessage()],
      isComplete: false,
    };
    set((state) => ({
      sessions: { ...state.sessions, [conversationId]: session },
      currentSessionId: conversationId,
    }));
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

    // 어시스턴트 메시지에 토큰을 누적하는 헬퍼
    const upsertAssistant = (messageId: string, mutate: (m: Message) => Message) => {
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
    };

    let assistantId: string | null = null;

    const cancel = streamMessage(sessionId, content, {
      onEvent: (ev: SseEvent) => {
        switch (ev.event) {
          case 'start':
            assistantId = ev.data.message_id;
            upsertAssistant(assistantId, (m) => m);
            break;
          case 'token':
            if (assistantId) {
              const id = assistantId;
              upsertAssistant(id, (m) => ({ ...m, content: m.content + ev.data.text }));
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
          case 'error':
            set({ error: ev.data.message || '응답 생성 중 오류가 발생했어요.' });
            break;
          case 'done':
            if (assistantId) {
              const id = assistantId;
              upsertAssistant(id, (m) => ({ ...m, streaming: false }));
            }
            break;
        }
      },
      onError: (err: ApiError) => {
        set({ isTyping: false, cancelStream: null, error: err.message });
      },
      onComplete: () => {
        set({ isTyping: false, cancelStream: null });
      },
    });

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
