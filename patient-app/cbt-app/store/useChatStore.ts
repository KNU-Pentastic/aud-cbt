import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  sessionNumber: number;
  stage: 1 | 2 | 3 | 4 | 5;
  messages: Message[];
  isComplete: boolean;
  startedAt: string;
};

type ChatState = {
  sessions: Record<string, ChatSession>;
  currentSessionId: string | null;
  isTyping: boolean;
  startNewSession: () => string;
  sendMessage: (sessionId: string, content: string) => void;
  completeSession: (sessionId: string) => void;
};

const MOCK_RESPONSES: Record<1 | 2 | 3 | 4 | 5, string[]> = {
  1: [
    '음주를 하게 되는 상황이 있으신가요? 예를 들어 스트레스를 받을 때나 특별한 감정이 들 때요. 편하게 이야기해 주세요.',
    '요즘 어떻게 지내고 계신가요? 술과 관련된 생각이나 감정이 떠오를 때가 있다면 어떤 순간인지 이야기해 주실 수 있을까요?',
    '오늘 이 자리에 오신 것만으로도 정말 잘 하셨어요. 지금 이 순간 어떤 감정이 드시나요? 어떤 이야기라도 괜찮아요.',
  ],
  2: [
    '그 감정이 처음 느껴졌던 게 언제부터인지 기억나세요? 그 당시 어떤 일이 있었는지 이야기해 주실 수 있나요?',
    '그 상황에서 가장 강하게 느껴진 감정은 어떤 것이었나요? 그 감정이 몸에서는 어떻게 느껴졌는지도 궁금해요.',
    '말씀해 주신 내용이 많이 힘드셨을 것 같아요. 그런 상황이 얼마나 자주 일어나는 편인가요?',
  ],
  3: [
    '그 순간 머릿속에 어떤 생각이 스쳐 지나갔나요? 판단 없이 떠오르는 생각 그대로 말씀해 주셔도 괜찮아요.',
    "지금 이야기를 나누면서 어떤 생각이 드세요? 혹시 '나는 ~해야 한다'거나 '나는 ~이다'라는 생각이 떠오르지는 않으셨나요?",
    '그 생각이 얼마나 사실처럼 느껴지시나요? 0에서 10으로 표현한다면 몇 점쯤 될까요?',
  ],
  4: [
    '다른 관점에서 그 상황을 바라본다면 어떻게 보일까요? 가장 친한 친구가 같은 상황이었다면 어떤 말을 해줄 것 같으세요?',
    '지금 갖고 계신 생각 외에 다른 가능성은 없을까요? 잠깐 다른 시각으로 같이 생각해봐요.',
    '그 생각이 도움이 된다고 느끼시나요, 아니면 오히려 힘들게 하는 것 같으신가요? 조금 더 편안한 생각으로 바꾼다면 어떤 것일까요?',
  ],
  5: [
    '오늘 대화를 통해 어떤 점을 새롭게 알게 되셨나요? 오늘 하신 이야기 중 가장 기억에 남는 부분이 있으시면 나눠주세요.',
    '오늘 대화를 한 문장으로 정리한다면 어떻게 표현하시겠어요? 작은 것이라도 오늘 스스로 잘 하셨다고 느끼는 부분이 있으신가요?',
    '오늘 이렇게 솔직하게 이야기해 주셔서 감사해요. 오늘 나눈 이야기를 토대로, 내일 하루 작은 목표가 있다면 어떤 것일까요?',
  ],
};

const GREETING =
  '안녕하세요. 오늘 대화에 함께해 주셔서 감사해요. 이 공간은 판단 없이 편하게 이야기 나눌 수 있는 곳이에요. 오늘 어떻게 지내셨나요?';

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},
      currentSessionId: null,
      isTyping: false,

      startNewSession: () => {
        const id = Date.now().toString();
        const sessionNumber = Object.keys(get().sessions).length + 1;

        const greeting: Message = {
          id: `${id}_greeting`,
          role: 'assistant',
          content: GREETING,
          createdAt: new Date().toISOString(),
        };

        const session: ChatSession = {
          id,
          sessionNumber,
          stage: 1,
          messages: [greeting],
          isComplete: false,
          startedAt: new Date().toISOString(),
        };

        set((state) => ({
          sessions: { ...state.sessions, [id]: session },
          currentSessionId: id,
        }));

        return id;
      },

      sendMessage: (sessionId, content) => {
        const session = get().sessions[sessionId];
        if (!session || session.isComplete) return;

        const userMsg: Message = {
          id: Date.now().toString(),
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        };

        const userCount =
          session.messages.filter((m) => m.role === 'user').length + 1;
        const newStage = Math.min(
          5,
          Math.floor(userCount / 5) + 1
        ) as 1 | 2 | 3 | 4 | 5;

        set((state) => ({
          isTyping: true,
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              stage: newStage,
              messages: [...session.messages, userMsg],
            },
          },
        }));

        setTimeout(() => {
          const current = get().sessions[sessionId];
          const pool = MOCK_RESPONSES[current.stage];
          const reply = pool[Math.floor(Math.random() * pool.length)];

          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: reply,
            createdAt: new Date().toISOString(),
          };

          set((state) => ({
            isTyping: false,
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...state.sessions[sessionId],
                messages: [...state.sessions[sessionId].messages, aiMsg],
              },
            },
          }));
        }, 1500);
      },

      completeSession: (sessionId) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              isComplete: true,
            },
          },
        }));
      },
    }),
    {
      name: '@cbt_chat',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
