import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type AudioMocks, fakeVoice, FakeUtterance, installAudio } from "../test-utils/browser-mocks";
import { MAX_SERVER_FAILURES, useInterviewerVoice, type FetchMessageAudio } from "./use-interviewer-voice";
import type { SpeechSynthesisLike } from "./use-speech-synthesis";

const QUESTION = { key: "m7", text: "Ceritakan pengalaman Anda.", messageId: 7 };

function makeSynth(voices = [fakeVoice("Google Bahasa Indonesia", "id-ID")]) {
  const synth = {
    speak: vi.fn<(utterance: SpeechSynthesisUtterance) => void>(),
    cancel: vi.fn(),
    getVoices: () => voices,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } satisfies SpeechSynthesisLike;
  return synth;
}

function setup(fetchAudio: FetchMessageAudio, serverTts = true) {
  const synth = makeSynth();
  const element = new Audio();
  const hook = renderHook(() =>
    useInterviewerVoice({
      lang: "id-ID",
      serverTts,
      fetchAudio,
      audio: element,
      synth,
      createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    }),
  );
  return { ...hook, synth, element };
}

describe("useInterviewerVoice", () => {
  let audio: AudioMocks;
  beforeEach(() => {
    audio = installAudio();
  });
  afterEach(() => {
    cleanup();
    audio.restore();
  });

  it("plays server audio and stays 'speaking' from the request until the clip ends", async () => {
    let resolveClip: (blob: Blob) => void = () => undefined;
    const fetchAudio = vi.fn<FetchMessageAudio>(() => new Promise<Blob>((resolve) => (resolveClip = resolve)));
    const { result, element, synth } = setup(fetchAudio);

    act(() => result.current.speak(QUESTION));
    expect(fetchAudio).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(result.current.speaking).toBe(true);
    expect(result.current.preparing).toBe(true);

    await act(async () => resolveClip(new Blob(["RIFF"], { type: "audio/wav" })));
    await waitFor(() => expect(audio.play).toHaveBeenCalled());
    expect(element.src).toBe("blob:interviewer-audio-1");
    expect(result.current.preparing).toBe(false);
    expect(result.current.speaking).toBe(true);

    act(() => element.dispatchEvent(new Event("ended")));
    expect(result.current.speaking).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("prefetches once and reuses the clip when speaking", async () => {
    const fetchAudio = vi.fn<FetchMessageAudio>(() => Promise.resolve(new Blob(["RIFF"])));
    const { result } = setup(fetchAudio);
    act(() => result.current.prefetch(QUESTION));
    act(() => result.current.speak(QUESTION));
    await waitFor(() => expect(audio.play).toHaveBeenCalled());
    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("falls back to speech synthesis on failure and stops trying the server after repeated failures", async () => {
    const fetchAudio = vi.fn<FetchMessageAudio>(() => Promise.reject(new Error("503 tts_unavailable")));
    const { result, synth } = setup(fetchAudio);

    for (let i = 0; i < MAX_SERVER_FAILURES; i += 1) {
      act(() => result.current.speak({ ...QUESTION, key: `m${i}`, messageId: i }));
      await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(i + 1));
    }
    expect(result.current.serverAudio).toBe(false);
    act(() => result.current.speak({ ...QUESTION, key: "m9", messageId: 9 }));
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(MAX_SERVER_FAILURES + 1));
    expect(fetchAudio).toHaveBeenCalledTimes(MAX_SERVER_FAILURES);
  });

  it("falls back when playback is blocked", async () => {
    audio.restore();
    audio = installAudio({ playError: new DOMException("blocked", "NotAllowedError") });
    const { result, synth } = setup(() => Promise.resolve(new Blob(["RIFF"])));
    act(() => result.current.speak(QUESTION));
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
  });

  it("cancel stops the audio", async () => {
    const { result } = setup(() => Promise.resolve(new Blob(["RIFF"])));
    act(() => result.current.speak(QUESTION));
    await waitFor(() => expect(audio.play).toHaveBeenCalled());
    audio.pause.mockClear();
    act(() => result.current.cancel());
    expect(audio.pause).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("unlock plays a silent clip on the persistent element", () => {
    const { result, element } = setup(() => Promise.resolve(new Blob(["RIFF"])));
    act(() => result.current.unlock());
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.lastElement()).toBe(element);
    expect(audio.playedSources[0]).toMatch(/^data:audio\/wav;base64,/);
  });

  it("uses the browser voice when server TTS is off", async () => {
    const fetchAudio = vi.fn<FetchMessageAudio>();
    const { result, synth } = setup(fetchAudio, false);
    act(() => result.current.speak(QUESTION));
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    expect(fetchAudio).not.toHaveBeenCalled();
  });
});
