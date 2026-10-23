# daily-kana

일본어 단어를 보고 **한글로 발음**, **한국어로 뜻**을 입력하면 바로 채점해 주는 개인 학습용 웹앱(PWA)입니다. 실행 중에는 AI를 쓰지 않습니다.

현재 상태: 채점 엔진(발음·뜻)과 데이터 파이프라인 완료, 화면 구현 전. N5 674개 한국어 뜻 생성·Codex 교차 검사 통과.

뜻 데이터 품질은 Codex 교차 검사로 확인합니다. 마지막 차수 지적률이 6% 이하이거나 모든 지적을 반영·근거 있는 기각으로 처리하면 통과입니다(`review/n5/dispositions.md`). 사람 표본 검수는 하지 않습니다.

## 디렉토리
- `data/source/openjlpt-0.3.0/` — 원천 단어 데이터(OpenJLPT)
- `data/ko/` — 한국어 뜻·인정 동의어(Claude Code로 생성, Codex로 교차 검사)
- `scripts/gen-ko.prompt.md` — 뜻 생성 지침
- `review/` — 교차 검사 기록과 표본 표

## 데이터 출처와 라이선스
`data/` 아래 데이터는 [OpenJLPT](https://github.com/evanclan/OpenJLPT)(CC BY-SA 4.0)를 포함하며, OpenJLPT는 JMdict·KANJIDIC2(EDRDG), Jonathan Waller의 JLPT 목록, Tatoeba를 사용합니다. 파생 데이터(한국어 뜻 포함)도 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)으로 배포합니다. 자세한 내용은 `NOTICE.md`를 보세요. 앱 코드 라이선스는 아직 정하지 않았습니다.
