# Claude Code Discord Controller

모바일 Discord에서 여러 프로젝트의 Claude Code 세션을 관리하는 봇입니다.

채널별로 독립적인 Claude Code 세션을 실행하고, tool use 승인/거절을 Discord 버튼으로 제어할 수 있습니다.

## 주요 기능

- 📱 모바일 Discord에서 Claude Code 원격 제어
- 🔀 채널별 독립 세션 (프로젝트 디렉토리 매핑)
- ✅ tool use 승인/거절 Discord 버튼 UI
- 🔄 세션 재개 지원 (봇 재시작 후에도 이전 세션 이어가기)
- ⏱️ 실시간 진행 상황 표시 (도구 사용 현황, 경과 시간)
- 🔒 유저 화이트리스트, 레이트리밋, 경로 보안

## 기술 스택

| 분류 | 기술 |
|------|------|
| Runtime | Node.js 20+, TypeScript |
| Discord | discord.js v14 |
| AI | @anthropic-ai/claude-agent-sdk |
| DB | better-sqlite3 (SQLite) |
| 검증 | zod v4 |
| 빌드 | tsup (ESM) |
| 테스트 | vitest |

## 설치

```bash
git clone git@github.com:chadingTV/claudecode-discord.git
cd claudecode-discord
npm install
cp .env.example .env   # 환경변수 설정 후
npm run dev
```

Discord 봇 생성, 환경변수 상세 설정, Windows(WSL) 환경 안내, Claude Code 설치 방법 등
전체 셋업 과정은 **[SETUP.md](SETUP.md)** 를 참고하세요.

## 사용법

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `/register <폴더명>` | 현재 채널에 프로젝트 연결 | `/register my-project` |
| `/unregister` | 채널 등록 해제 | |
| `/status` | 전체 세션 상태 확인 | |
| `/stop` | 현재 채널 세션 중지 | |
| `/auto-approve on\|off` | 자동 승인 토글 | `/auto-approve on` |
| `/sessions` | 기존 세션 목록 조회 및 재개 | |

등록된 채널에 **일반 메시지**를 보내면 Claude가 응답합니다.

## 아키텍처

```
[모바일 Discord] ←→ [Discord Bot] ←→ [Session Manager] ←→ [Claude Agent SDK]
                          ↕
                     [SQLite DB]
```

- 채널별 독립 세션 (프로젝트 디렉토리 매핑)
- Claude Agent SDK가 Claude Code를 subprocess로 실행 (기존 인증 공유)
- tool use 승인은 Discord 버튼으로 처리 (자동승인 모드 지원)
- 스트리밍 응답을 1.5초 간격으로 Discord 메시지 edit
- 텍스트 출력 전까지 15초마다 heartbeat로 진행 상황 표시

## 세션 상태

| 상태 | 의미 |
|------|------|
| 🟢 online | Claude가 작업 중 |
| 🟡 waiting | tool use 승인 대기 |
| ⚪ idle | 작업 완료, 다음 입력 대기 |
| 🔴 offline | 세션 없음 |

## 보안

- `ALLOWED_USER_IDS` 화이트리스트 기반 인증
- 분당 요청 수 제한 (rate limit)
- 프로젝트 경로 `..` 순회 차단
- tool use 기본값: 매번 사용자 승인 요청

## 개발 명령어

```bash
npm run dev          # 개발 실행 (tsx)
npm run build        # 프로덕션 빌드 (tsup)
npm start            # 빌드된 파일 실행
npm test             # 테스트 (vitest)
npm run test:watch   # 테스트 watch 모드
```
