import { vi } from "vitest";

/** Test doubles for the browser media + speech APIs jsdom doesn't implement. */

export class FakeTrack extends EventTarget {
  readonly kind: "audio" | "video";
  readonly label: string;
  enabled = true;
  readyState: "live" | "ended" = "live";
  readonly stop = vi.fn(() => {
    this.readyState = "ended";
  });

  constructor(kind: "audio" | "video", label = `${kind}-track`) {
    super();
    this.kind = kind;
    this.label = label;
  }

  /** Simulate the browser ending the track (e.g. its own "Stop sharing" button). */
  end(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

export class FakeStream {
  private tracks: FakeTrack[];

  constructor(tracks: FakeTrack[]) {
    this.tracks = [...tracks];
  }

  getTracks = () => [...this.tracks];
  getAudioTracks = () => this.tracks.filter((track) => track.kind === "audio");
  getVideoTracks = () => this.tracks.filter((track) => track.kind === "video");
  addTrack = (track: FakeTrack) => {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  };
  removeTrack = (track: FakeTrack) => {
    this.tracks = this.tracks.filter((item) => item !== track);
  };
}

function asStream(stream: FakeStream): MediaStream {
  return stream as unknown as MediaStream;
}

export interface MediaMocks {
  getUserMedia: ReturnType<typeof vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>>;
  getDisplayMedia: ReturnType<typeof vi.fn<(options?: DisplayMediaStreamOptions) => Promise<MediaStream>>>;
  /** Every track handed out so far (camera, mic and screen). */
  tracks: FakeTrack[];
  screenTracks: FakeTrack[];
  restore: () => void;
}

export function installMediaDevices(options: { userMediaError?: DOMException; displayMedia?: boolean } = {}): MediaMocks {
  const tracks: FakeTrack[] = [];
  const screenTracks: FakeTrack[] = [];
  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    if (options.userMediaError) throw options.userMediaError;
    const created: FakeTrack[] = [];
    if (constraints.audio) created.push(new FakeTrack("audio"));
    if (constraints.video) created.push(new FakeTrack("video"));
    tracks.push(...created);
    return asStream(new FakeStream(created));
  });
  const getDisplayMedia = vi.fn(async () => {
    const track = new FakeTrack("video", "screen");
    tracks.push(track);
    screenTracks.push(track);
    return asStream(new FakeStream([track]));
  });
  const devices: Partial<MediaDevices> = { getUserMedia };
  if (options.displayMedia !== false) devices.getDisplayMedia = getDisplayMedia;
  Object.defineProperty(navigator, "mediaDevices", { value: devices, configurable: true });
  return {
    getUserMedia,
    getDisplayMedia,
    tracks,
    screenTracks,
    restore: () => {
      Reflect.deleteProperty(navigator, "mediaDevices");
    },
  };
}

// ---------- Speech synthesis ----------

export class FakeUtterance {
  text: string;
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

export function fakeVoice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: false, voiceURI: name };
}

export interface SynthMock {
  speak: ReturnType<typeof vi.fn<(utterance: FakeUtterance) => void>>;
  cancel: ReturnType<typeof vi.fn<() => void>>;
  spoken: FakeUtterance[];
  /** Finish the most recent utterance (fires its `end`). */
  finishSpeaking: () => void;
}

export function installSpeechSynthesis(
  voices: SpeechSynthesisVoice[] = [fakeVoice("Google US English", "en-US"), fakeVoice("Google Bahasa Indonesia", "id-ID")],
): SynthMock {
  const spoken: FakeUtterance[] = [];
  const speak = vi.fn((utterance: FakeUtterance) => {
    spoken.push(utterance);
  });
  const cancel = vi.fn(() => undefined);
  const synth = {
    speak,
    cancel,
    resume: () => undefined,
    getVoices: () => voices,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return {
    speak,
    cancel,
    spoken,
    finishSpeaking: () => spoken[spoken.length - 1]?.onend?.(),
  };
}

// ---------- Speech recognition ----------

interface FakeResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}

export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  running = false;
  onresult: ((event: FakeResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  readonly start = vi.fn(() => {
    this.running = true;
    this.onstart?.();
  });
  readonly stop = vi.fn(() => {
    this.running = false;
    this.onend?.();
  });
  readonly abort = vi.fn(() => {
    this.running = false;
    this.onend?.();
  });

  constructor() {
    FakeRecognition.instances.push(this);
  }

  static latest(): FakeRecognition | undefined {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }

  emit(transcript: string, isFinal: boolean): void {
    const result = Object.assign([{ transcript, confidence: 0.9 }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

export function installSpeechRecognition(): void {
  FakeRecognition.instances = [];
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
}

// ---------- Audio playback (server text-to-speech) ----------

export interface AudioMocks {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  /** `src` of every play() call, in order. */
  playedSources: string[];
  /** The element most recently played. */
  lastElement: () => HTMLMediaElement | undefined;
  /** Fire `ended` on the element that is playing. */
  finishPlaying: () => void;
  restore: () => void;
}

/** jsdom has no media playback or object URLs: stub play/pause and URL.createObjectURL. */
export function installAudio(options: { playError?: DOMException } = {}): AudioMocks {
  const elements: HTMLMediaElement[] = [];
  const playedSources: string[] = [];
  const play = vi.fn(function play(this: HTMLMediaElement) {
    elements.push(this);
    playedSources.push(this.src);
    return options.playError ? Promise.reject(options.playError) : Promise.resolve();
  });
  const pause = vi.fn(() => undefined);
  const proto = HTMLMediaElement.prototype;
  const originalPlay = Object.getOwnPropertyDescriptor(proto, "play");
  const originalPause = Object.getOwnPropertyDescriptor(proto, "pause");
  Object.defineProperty(proto, "play", { value: play, configurable: true, writable: true });
  Object.defineProperty(proto, "pause", { value: pause, configurable: true, writable: true });
  let count = 0;
  const createObjectURL = vi.fn((_blob: Blob) => `blob:interviewer-audio-${++count}`);
  const revokeObjectURL = vi.fn((_url: string) => undefined);
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true, writable: true });
  const lastElement = () => elements[elements.length - 1];
  return {
    play,
    pause,
    createObjectURL,
    revokeObjectURL,
    playedSources,
    lastElement,
    finishPlaying: () => {
      lastElement()?.dispatchEvent(new Event("ended"));
    },
    restore: () => {
      if (originalPlay) Object.defineProperty(proto, "play", originalPlay);
      if (originalPause) Object.defineProperty(proto, "pause", originalPause);
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    },
  };
}

/** A WAV-ish body for mocked audio responses. */
export function audioResponse(): Response {
  return new Response("RIFF0000WAVEfmt ", { status: 200, headers: { "Content-Type": "audio/wav" } });
}
