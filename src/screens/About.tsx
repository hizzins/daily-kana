import type { Screen } from "../App";

export default function About(props: { go: (s: Screen) => void }) {
  return (
    <>
      <header className="top">
        <button className="link" onClick={() => props.go({ name: "home" })}>← 레벨</button>
        <h1>정보</h1>
      </header>
      <section className="card">
        <h2>daily-kana</h2>
        <p>일본어 단어를 보고 한글로 발음, 한국어로 뜻을 입력하면 바로 채점하는 개인 학습 앱이에요. 채점은 기기 안에서 끝나고, 기록은 이 기기 브라우저에만 저장돼요.</p>
      </section>
      <section className="card">
        <h2>데이터 출처와 라이선스</h2>
        <ul className="plain">
          <li><a href="https://github.com/evanclan/OpenJLPT" target="_blank" rel="noreferrer">OpenJLPT</a> 0.3.0 — CC BY-SA 4.0</li>
          <li>JMdict, KANJIDIC2 — Electronic Dictionary Research and Development Group(EDRDG), CC BY-SA 4.0</li>
          <li>Jonathan Waller's JLPT Resources (tanos.co.uk) — CC BY</li>
          <li>Tatoeba — CC BY 2.0 FR</li>
          <li>한국어 뜻·인정 동의어, 교재 단어 — 이 앱에서 작성, CC BY-SA 4.0</li>
        </ul>
        <p className="muted">단어 데이터는 <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>으로 배포해요.</p>
      </section>
    </>
  );
}
