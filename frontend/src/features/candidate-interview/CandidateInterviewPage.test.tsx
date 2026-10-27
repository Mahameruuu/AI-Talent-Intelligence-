import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { CandidateInterviewState } from "@/types/api";
import { CandidateInterviewPage } from "./CandidateInterviewPage";
import { SILENT_WAV } from "./hooks/use-interviewer-voice";
import {
  audioResponse,
  type AudioMocks,
  FakeRecognition,
  fakeVoice,
  installAudio,
  installMediaDevices,
  installSpeechRecognition,
  installSpeechSynthesis,
  type MediaMocks,
} from "./test-utils/browser-mocks";

const TOKEN = "test-token-123";
const QUESTION = "Ceritakan proyek machine learning yang paling Anda banggakan.";

const pendingState: CandidateInterviewState = {
  status: "pending",
  language: "id",
  mode: "template",
  acknowledgements: [],
  speech_lang: "id-ID",
  interviewer_name: "Pewawancara AI XORCA",
  candidate_name: "Alex Pratama",
  candidate_first_name: "Alex",
  job_title: "Data Scientist",
  company_name: "Acme Analytics",
  instructions: ["Jawab dengan kata-kata Anda sendiri.", "Gunakan tempat yang tenang."],
  privacy_notice: "Jawaban Anda disimpan dengan aman dan hanya digunakan untuk menilai lamaran ini.",
  duration_minutes: 25,
  started_at: null,
  questions_total: 5,
  questions_answered: 0,
  current_question: null,
  consent_given: false,
  expires_at: "2030-01-01T12:00:00Z",
  voice: { server_tts: false },
  messages: [],
};

const inProgressState: CandidateInterviewState = {
  ...pendingState,
  status: "in_progress",
  consent_given: true,
  started_at: "2029-12-30T10:00:00Z",
  current_question: { index: 1, total: 5, text: QUESTION, is_follow_up: false, message_id: 1 },
  messages: [{ id: 1, role: "assistant", content: QUESTION, created_at: "2029-12-30T10:00:00Z" }],
};

const FOLLOW_UP = "Metrik apa yang Anda gunakan untuk mengevaluasi model tersebut?";
const afterAnswerState: CandidateInterviewState = {
  ...inProgressState,
  questions_answered: 1,
  current_question: { index: 1, total: 5, text: FOLLOW_UP, is_follow_up: true, message_id: 3 },
  messages: [
    ...inProgressState.messages,
    { id: 2, role: "candidate", content: "jawaban", created_at: "2029-12-30T10:01:00Z" },
    { id: 3, role: "assistant", content: FOLLOW_UP, created_at: "2029-12-30T10:01:05Z" },
  ],
};

const completedState: CandidateInterviewState = { ...inProgressState, status: "completed", current_question: null };

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

function callsTo(fetchMock: ReturnType<typeof mockFetch>, path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith(path));
}

function bodyOf(call: [RequestInfo | URL, RequestInit?] | undefined): unknown {
  return JSON.parse(String(call?.[1]?.body));
}

/** Answers GET with `state`, /messages with `afterMessage`, /complete with completed, audio with `audio`. */
function mockInterviewApi(
  state: CandidateInterviewState,
  afterMessage: CandidateInterviewState = afterAnswerState,
  audio: (url: string) => Response = () => jsonResponse({ error: { code: "tts_unavailable", message: "x" } }, 503),
) {
  return mockFetch((url, init) => {
    if (/\/candidate-interview\/messages\/\d+\/audio$/.test(url)) return audio(url);
    if (url.endsWith("/candidate-interview/start") && init?.method === "POST") return jsonResponse(inProgressState);
    if (url.endsWith("/candidate-interview/messages") && init?.method === "POST") return jsonResponse(afterMessage);
    if (url.endsWith("/candidate-interview/complete") && init?.method === "POST") return jsonResponse(completedState);
    return jsonResponse(state);
  });
}

describe("CandidateInterviewPage", () => {
  let originalUrl: string;
  let media: MediaMocks;
  let audio: AudioMocks;

  beforeEach(() => {
    originalUrl = window.location.pathname + window.location.search + window.location.hash;
    window.location.hash = `#${TOKEN}`;
    media = installMediaDevices();
    audio = installAudio();
  });

  afterEach(() => {
    // replaceState restores the URL without firing a hashchange event into a mounted page.
    window.history.replaceState(null, "", originalUrl);
    cleanup(); // unmount while the media stubs are still installed
    media.restore();
    audio.restore();
  });

  /** Render an in-progress interview and rejoin from the lobby. */
  async function enterRoom(
    state: CandidateInterviewState = inProgressState,
    afterMessage?: CandidateInterviewState,
    audioHandler?: (url: string) => Response,
  ) {
    const fetchMock = mockInterviewApi(state, afterMessage, audioHandler);
    const user = userEvent.setup();
    renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });
    await user.click(await screen.findByRole("button", { name: "Gabung kembali" }));
    await screen.findByRole("toolbar");
    return { fetchMock, user };
  }

  describe("lobby", () => {
    it("shows device preview and consent, keeps join disabled until consent, and sends the token only as a header", async () => {
      installSpeechRecognition();
      const fetchMock = mockInterviewApi(pendingState);
      const user = userEvent.setup();

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByRole("heading", { name: "Siap bergabung?" })).toBeInTheDocument();
      expect(screen.getByText(/Jawaban Anda disimpan dengan aman/)).toBeInTheDocument();
      expect(screen.getByText("Jawab dengan kata-kata Anda sendiri.")).toBeInTheDocument();
      expect(screen.getByRole("meter", { name: "Level mikrofon" })).toBeInTheDocument();
      await waitFor(() => expect(media.getUserMedia).toHaveBeenCalled());
      expect(media.getUserMedia.mock.calls[0]?.[0]).toMatchObject({ audio: expect.anything(), video: expect.anything() });

      const consent = screen.getByRole("checkbox", { name: /saya telah membaca pemberitahuan privasi/i });
      const join = screen.getByRole("button", { name: "Gabung sekarang" });
      expect(consent).not.toBeChecked();
      expect(join).toBeDisabled();

      await user.click(consent);
      expect(join).toBeEnabled();

      expect(fetchMock).toHaveBeenCalled();
      for (const [input, init] of fetchMock.mock.calls) {
        expect(String(input)).not.toContain(TOKEN);
        expect(headersOf(init)["X-Interview-Token"]).toBe(TOKEN);
      }
      const [firstUrl, firstInit] = fetchMock.mock.calls[0] ?? [];
      expect(String(firstUrl)).toMatch(/\/candidate-interview$/);
      expect(firstInit?.method ?? "GET").toBe("GET");
    });

    it("joins with POST /candidate-interview/start and enters the meeting room", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const fetchMock = mockInterviewApi(pendingState);
      const user = userEvent.setup();

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });
      await user.click(await screen.findByRole("checkbox", { name: /saya telah membaca/i }));
      await user.click(screen.getByRole("button", { name: "Gabung sekarang" }));

      expect(await screen.findByText("Pertanyaan 1 dari 5")).toBeInTheDocument();
      expect(screen.getByRole("figure", { name: /Pewawancara AI XORCA/ })).toBeInTheDocument();
      expect(screen.getByText("Kamera & layar tidak direkam")).toBeInTheDocument();

      const startCall = callsTo(fetchMock, "/candidate-interview/start")[0];
      expect(startCall?.[1]?.method).toBe("POST");
      expect(headersOf(startCall?.[1])["X-Interview-Token"]).toBe(TOKEN);
      expect(bodyOf(startCall)).toEqual({ consent: true });
      expect(String(startCall?.[0])).not.toContain(TOKEN);
    });

    it("explains a blocked camera/microphone and still allows joining", async () => {
      media.restore();
      media = installMediaDevices({ userMediaError: new DOMException("blocked", "NotAllowedError") });
      mockInterviewApi(inProgressState);

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByText(/Akses kamera\/mikrofon ditolak/)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Kamera mati" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Gabung kembali" })).toBeEnabled();
    });
  });

  describe("meeting room", () => {
    it("reads the question aloud with an Indonesian voice, once per message", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      await enterRoom();

      await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
      const utterance = synth.spoken[0];
      expect(utterance?.text).toBe(QUESTION);
      expect(utterance?.lang).toBe("id-ID");
      expect(utterance?.voice?.lang).toBe("id-ID");
      expect(screen.getByTestId("captions")).toHaveTextContent(QUESTION);
      // Not listening while the interviewer speaks.
      expect(FakeRecognition.latest()?.start ?? vi.fn()).not.toHaveBeenCalled();

      act(() => synth.finishSpeaking());
      await waitFor(() => expect(FakeRecognition.latest()?.start).toHaveBeenCalled());
      expect(synth.speak).toHaveBeenCalledTimes(1);
    });

    it("plays the interviewer's server audio (prefetched in the lobby) before listening", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const serverState: CandidateInterviewState = { ...inProgressState, voice: { server_tts: true } };
      const fetchMock = mockInterviewApi(serverState, { ...afterAnswerState, voice: { server_tts: true } }, () => audioResponse());
      const user = userEvent.setup();
      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      // Prefetched as soon as the message is known, before joining; token only in the header.
      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/messages/1/audio")).toHaveLength(1));
      const audioCall = callsTo(fetchMock, "/candidate-interview/messages/1/audio")[0];
      expect(headersOf(audioCall?.[1])["X-Interview-Token"]).toBe(TOKEN);
      expect(String(audioCall?.[0])).not.toContain(TOKEN);

      await user.click(await screen.findByRole("button", { name: "Gabung kembali" }));
      await screen.findByRole("toolbar");
      // Join unlocked the persistent element with a silent clip inside the click.
      expect(audio.playedSources[0]).toBe(SILENT_WAV);
      await waitFor(() => expect(audio.playedSources).toContain("blob:interviewer-audio-1"));
      expect(callsTo(fetchMock, "/candidate-interview/messages/1/audio")).toHaveLength(1);
      expect(screen.getAllByText("Pewawancara sedang berbicara…").length).toBeGreaterThan(0);
      expect(screen.getByTestId("captions")).toHaveTextContent(QUESTION);
      expect(FakeRecognition.latest()?.start ?? vi.fn()).not.toHaveBeenCalled();
      expect(synth.speak).not.toHaveBeenCalled();

      act(() => audio.finishPlaying());
      await waitFor(() => expect(FakeRecognition.latest()?.start).toHaveBeenCalled());

      // The follow-up is fetched and played from the server too; ending the call stops the audio.
      await user.type(screen.getByRole("textbox", { name: "Jawaban Anda" }), "Jawaban saya.");
      await user.click(screen.getByRole("button", { name: "Selesai menjawab" }));
      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/messages/3/audio")).toHaveLength(1));
      await waitFor(() => expect(audio.playedSources).toContain("blob:interviewer-audio-2"));
      expect(audio.revokeObjectURL).toHaveBeenCalledWith("blob:interviewer-audio-1");
      const pausesBefore = audio.pause.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Akhiri wawancara" }));
      const dialog = await screen.findByRole("dialog", { name: "Akhiri wawancara sekarang?" });
      await user.click(within(dialog).getByRole("button", { name: "Akhiri & kirim" }));
      expect(await screen.findByRole("heading", { name: "Wawancara selesai" })).toBeInTheDocument();
      expect(audio.pause.mock.calls.length).toBeGreaterThan(pausesBefore);
      expect(synth.speak).not.toHaveBeenCalled();
    });

    it("falls back to the browser voice when the server audio is unavailable (503)", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const { fetchMock } = await enterRoom({ ...inProgressState, voice: { server_tts: true } });

      await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
      expect(synth.spoken[0]?.text).toBe(QUESTION);
      expect(callsTo(fetchMock, "/candidate-interview/messages/1/audio").length).toBeGreaterThan(0);
      expect(audio.playedSources.filter((src) => src.startsWith("blob:"))).toHaveLength(0);
      expect(screen.queryByText(/Suara pewawancara tidak tersedia/)).not.toBeInTheDocument();
    });

    it("shows a notice when neither server audio nor an Indonesian browser voice is available", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis([fakeVoice("Samantha", "en-US")]);
      await enterRoom();

      expect(
        await screen.findByText("Suara pewawancara tidak tersedia di browser ini — pertanyaan ditampilkan sebagai teks."),
      ).toBeInTheDocument();
      expect(synth.speak).not.toHaveBeenCalled();
      await waitFor(() => expect(FakeRecognition.latest()?.start).toHaveBeenCalled());
    });

    it("fills the answer from speech recognition and submits it with input_mode voice", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const { fetchMock, user } = await enterRoom();
      await waitFor(() => expect(synth.speak).toHaveBeenCalled());
      act(() => synth.finishSpeaking());

      const recognition = await waitFor(() => {
        const instance = FakeRecognition.latest();
        expect(instance?.start).toHaveBeenCalled();
        return instance as FakeRecognition;
      });
      expect(recognition.lang).toBe("id-ID");
      expect(recognition.continuous).toBe(true);
      expect(recognition.interimResults).toBe(true);
      expect(await screen.findByText("Mendengarkan… silakan jawab")).toBeInTheDocument();

      act(() => recognition.emit("saya membangun model", false));
      expect(screen.getAllByText("saya membangun model").length).toBeGreaterThan(0);
      act(() => recognition.emit("Saya membangun model prediksi churn.", true));

      const answer = screen.getByRole("textbox", { name: "Jawaban Anda" });
      expect(answer).toHaveValue("Saya membangun model prediksi churn.");

      await user.click(screen.getByRole("button", { name: "Selesai menjawab" }));

      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/messages")).toHaveLength(1));
      const call = callsTo(fetchMock, "/candidate-interview/messages")[0];
      expect(bodyOf(call)).toEqual({ content: "Saya membangun model prediksi churn.", input_mode: "voice" });
      expect(headersOf(call?.[1])["X-Interview-Token"]).toBe(TOKEN);
      expect(recognition.abort).toHaveBeenCalled();

      // The follow-up arrives, is labelled and is spoken.
      expect(await screen.findByText("Pertanyaan lanjutan")).toBeInTheDocument();
      await waitFor(() => expect(synth.spoken.map((item) => item.text)).toContain(FOLLOW_UP));
      expect(screen.getByRole("textbox", { name: "Jawaban Anda" })).toHaveValue("");
    });

    it("submits a typed answer with input_mode text and rejects empty answers", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const { fetchMock, user } = await enterRoom();

      const done = screen.getByRole("button", { name: "Selesai menjawab" });
      expect(done).toBeDisabled();

      await user.type(screen.getByRole("textbox", { name: "Jawaban Anda" }), "Saya mengetik jawaban ini.");
      await user.click(done);

      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/messages")).toHaveLength(1));
      expect(bodyOf(callsTo(fetchMock, "/candidate-interview/messages")[0])).toEqual({
        content: "Saya mengetik jawaban ini.",
        input_mode: "text",
      });
    });

    it("stops speech recognition when the microphone is turned off", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const { user } = await enterRoom();
      await waitFor(() => expect(synth.speak).toHaveBeenCalled());
      act(() => synth.finishSpeaking());
      const recognition = await waitFor(() => {
        const instance = FakeRecognition.latest();
        expect(instance?.start).toHaveBeenCalled();
        return instance as FakeRecognition;
      });

      await user.click(screen.getByRole("button", { name: "Matikan mikrofon" }));

      expect(recognition.stop).toHaveBeenCalled();
      expect(recognition.running).toBe(false);
      expect(screen.getByRole("button", { name: "Nyalakan mikrofon" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("img", { name: "Mikrofon mati" })).toBeInTheDocument();
      const audio = media.tracks.find((track) => track.kind === "audio");
      expect(audio?.enabled).toBe(false);
    });

    it("shows the initials avatar and stops the camera when the camera is turned off", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const { user } = await enterRoom();
      await waitFor(() => expect(screen.queryByRole("img", { name: "Kamera mati" })).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "Matikan kamera" }));

      const selfTile = screen.getByRole("figure", { name: /Alex Pratama \(Anda\)/ });
      expect(within(selfTile).getByRole("img", { name: "Kamera mati" })).toHaveTextContent("AP");
      const video = media.tracks.find((track) => track.kind === "video");
      expect(video?.stop).toHaveBeenCalled();
    });

    it("shows the shared screen as the main tile until the browser ends the share", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const { user } = await enterRoom();

      await user.click(screen.getByRole("button", { name: "Bagikan layar" }));

      expect(await screen.findByRole("figure", { name: "Layar Anda" })).toBeInTheDocument();
      expect(screen.getByText("Anda sedang membagikan layar")).toBeInTheDocument();
      expect(media.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });

      act(() => media.screenTracks[0]?.end());

      await waitFor(() => expect(screen.queryByRole("figure", { name: "Layar Anda" })).not.toBeInTheDocument());
      expect(screen.queryByText("Anda sedang membagikan layar")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Bagikan layar" })).toBeInTheDocument();
    });

    it("ends the call after confirmation: completes, stops all tracks and shows the thank-you screen", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const { fetchMock, user } = await enterRoom();
      await user.click(screen.getByRole("button", { name: "Bagikan layar" }));
      await screen.findByRole("figure", { name: "Layar Anda" });

      await user.click(screen.getByRole("button", { name: "Akhiri wawancara" }));
      const dialog = await screen.findByRole("dialog", { name: "Akhiri wawancara sekarang?" });
      expect(callsTo(fetchMock, "/candidate-interview/complete")).toHaveLength(0);
      await user.click(within(dialog).getByRole("button", { name: "Akhiri & kirim" }));

      expect(await screen.findByRole("heading", { name: "Wawancara selesai" })).toBeInTheDocument();
      const completeCall = callsTo(fetchMock, "/candidate-interview/complete")[0];
      expect(completeCall?.[1]?.method).toBe("POST");
      expect(headersOf(completeCall?.[1])["X-Interview-Token"]).toBe(TOKEN);
      expect(media.tracks.length).toBeGreaterThanOrEqual(3);
      for (const track of media.tracks) expect(track.stop).toHaveBeenCalled();
      expect(synth.cancel).toHaveBeenCalled();
    });

    it("leaves the call when the final answer completes the interview", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const { user } = await enterRoom(inProgressState, completedState);

      await user.type(screen.getByRole("textbox", { name: "Jawaban Anda" }), "Jawaban terakhir.");
      await user.click(screen.getByRole("button", { name: "Selesai menjawab" }));

      expect(await screen.findByRole("heading", { name: "Wawancara selesai" })).toBeInTheDocument();
      for (const track of media.tracks) expect(track.stop).toHaveBeenCalled();
    });

    it("falls back to typing when speech recognition is not supported", async () => {
      installSpeechSynthesis();
      const { fetchMock, user } = await enterRoom();

      expect(screen.getByText(/paling baik di Google Chrome atau Microsoft Edge/)).toBeInTheDocument();
      await user.type(screen.getByRole("textbox", { name: "Jawaban Anda" }), "Jawaban ketik.");
      await user.click(screen.getByRole("button", { name: "Selesai menjawab" }));

      await waitFor(() =>
        expect(bodyOf(callsTo(fetchMock, "/candidate-interview/messages")[0])).toEqual({
          content: "Jawaban ketik.",
          input_mode: "text",
        }),
      );
    });

    it("shows the transcript panel with the conversation", async () => {
      installSpeechRecognition();
      installSpeechSynthesis();
      const { user } = await enterRoom();

      await user.click(screen.getByRole("button", { name: "Buka transkrip" }));
      const panel = screen.getByRole("complementary", { name: "Transkrip" });
      expect(within(panel).getByText(QUESTION)).toBeInTheDocument();
      expect(within(panel).getByRole("textbox", { name: "Jawaban Anda" })).toBeInTheDocument();
      expect(screen.getAllByRole("textbox", { name: "Jawaban Anda" })).toHaveLength(1);
    });
  });

  describe("conversational mode", () => {
    const ACKS = [
      "Baik, terima kasih atas jawabannya.",
      "Oke, menarik sekali.",
      "Terima kasih, saya catat ya.",
      "Baik, saya mengerti.",
      "Oke, terima kasih.",
    ];
    const GREETING = "Halo Alex! Senang bertemu. Silakan perkenalkan diri Anda.";
    const NEXT_QUESTION = "Terima kasih. Ceritakan proyek data yang paling menantang bagi Anda.";
    const CLOSING = "Pertanyaan yang bagus. Tim kami akan menghubungi Anda. Terima kasih atas waktunya, Alex!";

    const convState: CandidateInterviewState = {
      ...inProgressState,
      mode: "conversational",
      acknowledgements: ACKS,
      duration_minutes: 7,
      questions_total: 5,
      current_question: { index: 1, total: 5, text: GREETING, is_follow_up: false, message_id: 1 },
      messages: [{ id: 1, role: "assistant", content: GREETING, created_at: "2029-12-30T10:00:00Z" }],
    };
    const convNext: CandidateInterviewState = {
      ...convState,
      questions_answered: 1,
      current_question: { index: 2, total: 5, text: NEXT_QUESTION, is_follow_up: false, message_id: 3 },
      messages: [
        ...convState.messages,
        { id: 2, role: "candidate", content: "Saya Alex.", created_at: "2029-12-30T10:01:00Z" },
        { id: 3, role: "assistant", content: NEXT_QUESTION, created_at: "2029-12-30T10:01:05Z" },
      ],
    };
    const convCompleted: CandidateInterviewState = {
      ...convState,
      status: "completed",
      questions_answered: 5,
      current_question: null,
      messages: [
        ...convState.messages,
        { id: 2, role: "candidate", content: "Berapa besar timnya?", created_at: "2029-12-30T10:06:00Z" },
        { id: 3, role: "assistant", content: CLOSING, created_at: "2029-12-30T10:06:05Z" },
      ],
    };

    function clip(name: string): Response {
      // The content type names the clip so the stubbed object URL shows which one is played.
      return new Response("RIFF0000WAVEfmt ", { status: 200, headers: { "Content-Type": `audio/x-${name}` } });
    }

    /** Like mockInterviewApi, but POST /messages waits until `reply()` is called. */
    function mockConversation(state: CandidateInterviewState, afterMessage: CandidateInterviewState) {
      let reply: () => void = () => undefined;
      const answered = new Promise<Response>((resolve) => {
        reply = () => resolve(jsonResponse(afterMessage));
      });
      const fetchMock = mockFetch((url, init) => {
        const message = /\/candidate-interview\/messages\/(\d+)\/audio$/.exec(url);
        if (message) return clip(`message-${message[1]}`);
        const ack = /\/candidate-interview\/acknowledgements\/(\d+)\/audio$/.exec(url);
        if (ack) return clip(`ack-${ack[1]}`);
        if (url.endsWith("/candidate-interview/messages") && init?.method === "POST") return answered;
        return jsonResponse(state);
      });
      return { fetchMock, reply: () => reply() };
    }

    async function join() {
      const user = userEvent.setup();
      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });
      await user.click(await screen.findByRole("button", { name: "Gabung kembali" }));
      await screen.findByRole("toolbar");
      return user;
    }

    async function answer(user: ReturnType<typeof userEvent.setup>, text: string) {
      await user.type(screen.getByRole("textbox", { name: "Jawaban Anda" }), text);
      await user.click(screen.getByRole("button", { name: "Selesai menjawab" }));
    }

    it("plays a server acknowledgement while the answer is sent, then the next question after it", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      audio.createObjectURL.mockImplementation((blob: Blob) => `blob:${blob.type}`);
      const serverState = { ...convState, voice: { server_tts: true } };
      const { fetchMock, reply } = mockConversation(serverState, { ...convNext, voice: { server_tts: true } });
      const user = await join();

      await waitFor(() => expect(audio.playedSources).toContain("blob:audio/x-message-1"));
      act(() => audio.finishPlaying());
      // Acknowledgements were fetched ahead of time, with the token only in the header.
      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/acknowledgements/0/audio")).toHaveLength(1));
      const ackCall = callsTo(fetchMock, "/candidate-interview/acknowledgements/0/audio")[0];
      expect(headersOf(ackCall?.[1])["X-Interview-Token"]).toBe(TOKEN);

      await answer(user, "Saya Alex.");

      // The acknowledgement plays at once, while the POST is still in flight.
      await waitFor(() => expect(audio.playedSources).toContain("blob:audio/x-ack-0"));
      expect(callsTo(fetchMock, "/candidate-interview/messages")).toHaveLength(1);
      expect(screen.getAllByText("Pewawancara sedang berpikir…").length).toBeGreaterThan(0);
      // Acknowledgements are never captioned.
      expect(screen.queryByTestId("captions")).not.toBeInTheDocument();

      reply();
      await waitFor(() => expect(callsTo(fetchMock, "/candidate-interview/messages/3/audio")).toHaveLength(1));
      // The next question waits for the acknowledgement to finish (no overlap).
      expect(audio.playedSources).not.toContain("blob:audio/x-message-3");
      expect(screen.getAllByText("Pewawancara sedang berpikir…").length).toBeGreaterThan(0);

      act(() => audio.finishPlaying());
      await waitFor(() => expect(audio.playedSources).toContain("blob:audio/x-message-3"));
      expect(audio.playedSources.filter((src) => src.startsWith("blob:"))).toEqual([
        "blob:audio/x-message-1",
        "blob:audio/x-ack-0",
        "blob:audio/x-message-3",
      ]);
      expect(screen.getByTestId("captions")).toHaveTextContent(NEXT_QUESTION);
      expect(synth.speak).not.toHaveBeenCalled();

      // Not part of the transcript either.
      await user.click(screen.getByRole("button", { name: "Buka transkrip" }));
      const panel = screen.getByRole("complementary", { name: "Transkrip" });
      expect(within(panel).queryByText(ACKS[0] as string)).not.toBeInTheDocument();
    });

    it("falls back to the browser voice for the acknowledgement and holds the question until it ends", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const { reply } = mockConversation(convState, convNext);
      const user = await join();

      await waitFor(() => expect(synth.spoken.map((item) => item.text)).toEqual([GREETING]));
      act(() => synth.finishSpeaking());

      await answer(user, "Saya Alex.");
      await waitFor(() => expect(synth.spoken.map((item) => item.text)).toEqual([GREETING, ACKS[0]]));

      reply();
      expect(await screen.findByText("Pertanyaan 2 dari 5")).toBeInTheDocument();
      // Give the browser voice time to (wrongly) start the question.
      await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
      expect(synth.spoken.map((item) => item.text)).not.toContain(NEXT_QUESTION);
      expect(screen.getAllByText("Pewawancara sedang berpikir…").length).toBeGreaterThan(0);

      act(() => synth.finishSpeaking());
      await waitFor(() => expect(synth.spoken.map((item) => item.text)).toEqual([GREETING, ACKS[0], NEXT_QUESTION]));
    });

    it("reads the closing message after the final answer before showing the completed screen", async () => {
      installSpeechRecognition();
      const synth = installSpeechSynthesis();
      const lastTurn: CandidateInterviewState = { ...convState, questions_answered: 4 };
      const { reply } = mockConversation(lastTurn, convCompleted);
      const user = await join();
      await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
      act(() => synth.finishSpeaking());

      await answer(user, "Berapa besar timnya?");
      // Rotates through the acknowledgements: 4 answers so far -> the fifth line.
      await waitFor(() => expect(synth.spoken.at(-1)?.text).toBe(ACKS[4]));
      reply();
      act(() => synth.finishSpeaking());

      await waitFor(() => expect(synth.spoken.at(-1)?.text).toBe(CLOSING));
      expect(screen.getByTestId("captions")).toHaveTextContent(CLOSING);
      expect(screen.queryByRole("heading", { name: "Wawancara selesai" })).not.toBeInTheDocument();
      expect(screen.getByRole("toolbar")).toBeInTheDocument();

      act(() => synth.finishSpeaking());
      expect(await screen.findByRole("heading", { name: "Wawancara selesai" })).toBeInTheDocument();
      for (const track of media.tracks) expect(track.stop).toHaveBeenCalled();
    });
  });

  describe("status screens", () => {
    it("shows the expired screen when the API answers 410 expired", async () => {
      mockFetch(() => jsonResponse({ error: { code: "expired", message: "This invitation has expired." } }, 410));

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByRole("heading", { name: /this invitation has expired/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /join now/i })).not.toBeInTheDocument();
    });

    it("shows the incomplete-link screen when the URL has no token", async () => {
      window.history.replaceState(null, "", "/interview");
      const fetchMock = mockFetch(() => jsonResponse(pendingState));

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByRole("heading", { name: /this link is incomplete/i })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the completed screen in the interview language", async () => {
      mockFetch(() => jsonResponse(completedState));

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByRole("heading", { name: "Wawancara selesai" })).toBeInTheDocument();
      expect(screen.getByText("Terima kasih, Alex!")).toBeInTheDocument();
    });

    it("uses English copy for an English interview", async () => {
      mockInterviewApi({ ...pendingState, language: "en", speech_lang: "en-US" });

      renderWithProviders(<CandidateInterviewPage />, { route: "/interview" });

      expect(await screen.findByRole("heading", { name: "Ready to join?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Join now" })).toBeDisabled();
    });
  });
});
