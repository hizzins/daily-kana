// 듣기: 기기에 들어 있는 일본어 음성(speechSynthesis)으로 읽는다. 서버·음성 파일 없음.
import { useEffect, useState } from "react";

const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
const isJa = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase().startsWith("ja");

/**
 * 일본어 목소리를 고른다. 목소리 목록은 늦게 오기도 해서(voiceschanged) 아직 비어 있으면 lang 만 지정해 읽게 두고,
 * 목록이 왔는데 일본어가 없을 때만 쓸 수 없다고 본다.
 */
export function useJapaneseSpeech() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);

  useEffect(() => {
    if (!synth) return;
    const pick = () => {
      const voices = synth.getVoices();
      if (voices.length) setVoice(voices.find(isJa) ?? null);
    };
    pick();
    synth.addEventListener("voiceschanged", pick);
    return () => {
      synth.removeEventListener("voiceschanged", pick);
      synth.cancel();
    };
  }, []);

  const speak = (text: string, rate = 0.9) => {
    if (!synth) return;
    synth.cancel(); // 연달아 누르면 앞 소리를 끊고 새로 읽는다
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (voice) u.voice = voice;
    u.rate = rate;
    synth.speak(u);
  };

  return { available: !!synth && voice !== null, speak };
}
