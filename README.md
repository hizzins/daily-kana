# daily-kana

일본어 단어를 보고 **한글로 발음**, **한국어로 뜻**을 입력하면 바로 채점해 주는 개인 학습용 웹앱(PWA)입니다. 실행 중에는 AI를 쓰지 않습니다.

현재 상태: N5 단어 705개(가나)·506개(한자)와 읽기 연습 문장 100개. 홈 화면에 설치해 오프라인에서도 쓸 수 있는 PWA로, GitHub Pages에 검색 비노출로 배포합니다.

뜻 데이터 품질은 Codex 교차 검사로 확인합니다. 마지막 차수 지적률이 6% 이하이거나 모든 지적을 반영·근거 있는 기각으로 처리하면 통과입니다(`review/n5/dispositions.md`). 사람 표본 검수는 하지 않습니다.

## 실행

```sh
npm install
npm run dev      # 개발 서버
npm test         # 단위 테스트
npm run e2e      # 빌드 후 화면 테스트(Playwright, 설치된 Chrome 사용)
npm run build    # 타입 검사 + 빌드(dist/)
npm run data -- build   # 단어 데이터 검사 후 public/data 생성
```

## 배포

`main`에 푸시하면 `.github/workflows/deploy.yml`이 테스트·빌드 후 GitHub Pages(https://hizzins.github.io/daily-kana/)에 올립니다.
처음 한 번은 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꿔야 합니다.
검색 비노출은 `index.html`의 `noindex`와 `public/robots.txt`로 합니다(공개 전환 시 이 둘만 바꿈).

오프라인: 앱 화면은 설치 때 미리 받고, 단어·문장 데이터는 한 번 연 레벨만 저장합니다.
배포 결과를 로컬에서 확인하려면 `npm run build && npx vite preview --base /daily-kana/`.

## 디렉토리
- `data/source/openjlpt-0.3.0/` — 원천 단어 데이터(OpenJLPT)
- `data/ko/` — 한국어 뜻·인정 동의어(Claude Code로 생성, Codex로 교차 검사)
- `scripts/gen-ko.prompt.md` — 뜻 생성 지침
- `review/` — 교차 검사 기록과 표본 표

## 데이터 출처와 라이선스
`data/` 아래 데이터는 [OpenJLPT](https://github.com/evanclan/OpenJLPT)(CC BY-SA 4.0)를 포함하며, OpenJLPT는 JMdict·KANJIDIC2(EDRDG), Jonathan Waller의 JLPT 목록, Tatoeba를 사용합니다. 파생 데이터(한국어 뜻 포함)도 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)으로 배포합니다. 자세한 내용은 `NOTICE.md`를 보세요. 앱 코드 라이선스는 아직 정하지 않았습니다.
