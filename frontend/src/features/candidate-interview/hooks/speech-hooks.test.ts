import { act, renderHook, waitFor } from "@testing-library/react";
import { candidateInterviewStateSchema } from "@/services/schemas";
import { appendPhrase, MAX_ANSWER_LENGTH, resolveSpeechLang } from "../candidate-interview-utils";
import { FakeRecognition, fakeVoice, FakeUtterance } from "../test-utils/browser-mocks";
import { useSpeechRecognition, type SpeechRecognitionConstructor } from "./use-speech-recognition";
import { normalizeLang, pickVoice, splitForSpeech, useSpeechSynthesis, type SpeechSynthesisLike } from "./use-speech-synthesis";

const Recognition = FakeRecognition as unknown as SpeechRecognitionConstructor;

describe("pickVoice", () => {
  const voices = [
    fakeVoice("English", "en-US"),
    fakeVoice("Damayanti", "id_ID"),
    fakeVoice("Google Bahasa Indonesia", "id-ID"),
  ];

  it("prefers an exact, high-quality match and understands id_ID / legacy in-ID tags", () => {
    expect(pickVoice(voices, "id-ID")?.name).toBe("Google Bahasa Indonesia");
    expect(pickVoice([fakeVoice("Legacy", "in-ID")], "id-ID")?.name).toBe("Legacy");
    expect(normalizeLang("in_ID")).toBe("id-id");
  });

  it("falls back to the same language and returns null when there is none", () => {
    expect(pickVoice([fakeVoice("ID", "id")], "id-ID")?.name).toBe("ID");
    expect(pickVoice([fakeVoice("English", "en-US")], "id-ID")).toBeNull();
  });
});

describe("speech helpers", () => {
  it("splits long text into sentence groups", () => {
    const long = Array.from({ length: 10 }, (_, index) => `Kalimat nomor ${index} cukup panjang untuk diuji.`).join(" ");
    const chunks = splitForSpeech(long, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(long);
    expect(splitForSpeech("Halo")).toEqual(["Halo"]);
  });

  it("appends phrases with single spaces and caps the length", () => {
    expect(appendPhrase("", " halo ")).toBe("halo");
    expect(appendPhrase("halo ", "dunia")).toBe("halo dunia");
    expect(appendPhrase("x".repeat(MAX_ANSWER_LENGTH), "lagi")).toHaveLength(MAX_ANSWER_LENGTH);
  });

  it("parses older payloads with defaults for the new fields", () => {
    const parsed = candidateInterviewStateSchema.parse({
      status: "pending",
      candidate_first_name: "Alex",
      job_title: "Data Scientist",
      company_name: "Acme",
      instructions: [],
      privacy_notice: "",
      duration_minutes: 20,
      questions_total: 5,
      questions_answered: 0,
      consent_given: false,
      expires_at: "2030-01-01T00:00:00Z",
      messages: [],
    });
    expect(parsed.language).toBe("id");
    expect(parsed.current_question).toBeNull();
    expect(resolveSpeechLang(parsed)).toBe("id-ID");
  });
});

describe("useSpeechSynthesis", () => {
  it("waits for voiceschanged before choosing a voice", async () => {
    let voices: SpeechSynthesisVoice[] = [];
    const listeners = new Set<() => void>();
    const synth: SpeechSynthesisLike = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => voices,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const { result } = renderHook(() =>
      useSpeechSynthesis({
        lang: "id-ID",
        synth,
        createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
      }),
    );

    act(() => result.current.speak("Selamat datang."));
    expect(result.current.speaking).toBe(true);
    expect(synth.speak).not.toHaveBeenCalled();

    voices = [fakeVoice("Google Bahasa Indonesia", "id-ID")];
    await act(async () => {
      listeners.forEach((listener) => listener());
    });
    // Spoken after a short pause following cancel() (Chrome drops utterances queued right after cancel).
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.voice?.lang).toBe("id-ID");
  });

  it("doesn't read Indonesian with a foreign voice; captions only", async () => {
    const synth: SpeechSynthesisLike = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [fakeVoice("English", "en-US")],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const { result } = renderHook(() =>
      useSpeechSynthesis({
        lang: "id-ID",
        synth,
        createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
      }),
    );
    act(() => result.current.speak("Halo"));
    await waitFor(() => expect(result.current.noVoiceForLang).toBe(true));
    expect(synth.speak).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });
});

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("auto-restarts after the engine ends while still answering, and not after stop()", () => {
    const onFinalResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ lang: "id-ID", onFinalResult, Recognition }));

    act(() => result.current.start());
    const recognition = FakeRecognition.latest() as FakeRecognition;
    expect(recognition.start).toHaveBeenCalledTimes(1);

    // Chrome ends continuous sessions on silence: restart.
    act(() => {
      recognition.running = false;
      recognition.onend?.();
    });
    act(() => vi.advanceTimersByTime(300));
    expect(recognition.start).toHaveBeenCalledTimes(2);

    act(() => recognition.emit("halo", true));
    expect(onFinalResult).toHaveBeenCalledWith("halo");

    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(300));
    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(result.current.listening).toBe(false);
  });

  it("blocks itself when the microphone permission is denied", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "id-ID", onFinalResult: vi.fn(), Recognition }));
    act(() => result.current.start());
    const recognition = FakeRecognition.latest() as FakeRecognition;
    act(() => {
      recognition.onerror?.({ error: "not-allowed" });
      recognition.running = false;
      recognition.onend?.();
    });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.blocked).toBe("denied");
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported without a constructor", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "id-ID", onFinalResult: vi.fn(), Recognition: null }));
    expect(result.current.supported).toBe(false);
    expect(result.current.blocked).toBe("unsupported");
  });
});
