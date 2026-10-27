import { createContext, useContext } from "react";
import type { InterviewLanguage } from "@/types/api";
import type { MediaErrorKind } from "./hooks/media-errors";

/** Every candidate-facing string of the interview page. Keep `id` and `en` in sync (enforced by the type). */
export interface InterviewCopy {
  locale: string;
  // Generic
  onlineInterview: string;
  candidatePortal: string;
  loading: string;
  tryAgain: string;
  you: string;
  // Status screens
  thankYouTitle: (firstName: string | null) => string;
  completedTitle: string;
  completedBody: (jobTitle: string | null, companyName: string | null) => string;
  safeToClose: string;
  expiredTitle: string;
  expiredBody: string;
  revokedTitle: string;
  revokedBody: string;
  invalidTitle: string;
  invalidBody: string;
  invalidHint: string;
  incompleteTitle: string;
  incompleteBody: string;
  incompleteHint: string;
  loadFailedTitle: string;
  loadFailedBody: string;
  answersSaved: string;
  // Lobby
  readyToJoin: string;
  lobbyGreeting: (firstName: string | null) => string;
  lobbyIntro: (jobTitle: string, companyName: string) => string;
  aboutMinutes: (minutes: number) => string;
  questionsCount: (count: number) => string;
  linkValidUntil: (date: string) => string;
  cameraPreviewOff: string;
  startingCamera: string;
  micLevel: string;
  beforeYouStart: string;
  privacyNotice: string;
  privacyNoticeText: string;
  localOnlyNotice: string;
  consentLabel: string;
  consentAlreadyGiven: string;
  joinNow: string;
  rejoin: string;
  startFailed: string;
  aiNoDecisions: string;
  checkDevices: string;
  // Device / browser notices
  deviceDenied: string;
  deviceNotFound: string;
  deviceInUse: string;
  deviceInsecure: string;
  deviceUnsupported: string;
  deviceError: string;
  retryDevices: string;
  recognitionUnsupported: string;
  recognitionDenied: string;
  recognitionNetwork: string;
  voiceUnavailable: string;
  // Room
  privacyBadge: string;
  questionOf: (index: number, total: number) => string;
  followUp: string;
  interviewInProgress: string;
  elapsedOf: (elapsed: string, total: string) => string;
  aiSpeaking: string;
  aiPreparing: string;
  listening: string;
  yourTurn: string;
  yourTurnTyping: string;
  processing: string;
  /** Conversational mode: after the acknowledgement, until the next question is spoken. */
  thinking: string;
  micOffHint: string;
  sharingBanner: string;
  sharingLocalOnly: string;
  stopSharing: string;
  yourScreen: string;
  cameraOff: string;
  micMuted: string;
  // Controls
  turnOnMic: string;
  turnOffMic: string;
  turnOnCamera: string;
  turnOffCamera: string;
  shareScreen: string;
  stopShareScreen: string;
  screenShareUnsupported: string;
  captionsOn: string;
  captionsOff: string;
  openTranscript: string;
  closeTranscript: string;
  doneAnswering: string;
  sending: string;
  endCall: string;
  repeatQuestion: string;
  moreControls: string;
  // Answer box
  yourAnswer: string;
  answerPlaceholderVoice: string;
  answerPlaceholderText: string;
  waitingForInterviewer: string;
  answerTooLong: string;
  emptyAnswer: string;
  sendFailed: string;
  // Transcript panel
  transcript: string;
  interviewerLabel: string;
  noMessagesYet: string;
  // End call
  endTitle: string;
  endTitleAllAnswered: string;
  endBody: (answered: number, total: number) => string;
  endBodyAllAnswered: string;
  endConfirm: string;
  keepGoing: string;
  completeFailed: string;
}

const id: InterviewCopy = {
  locale: "id-ID",
  onlineInterview: "Wawancara online",
  candidatePortal: "Portal kandidat",
  loading: "Memuat wawancara Anda…",
  tryAgain: "Coba lagi",
  you: "Anda",
  thankYouTitle: (firstName) => (firstName ? `Terima kasih, ${firstName}!` : "Terima kasih!"),
  completedTitle: "Wawancara selesai",
  completedBody: (jobTitle, companyName) =>
    `Jawaban Anda telah dikirim${jobTitle ? ` untuk posisi ${jobTitle}` : ""}. Tim HR${
      companyName ? ` ${companyName}` : ""
    } akan meninjaunya dan menghubungi Anda mengenai langkah selanjutnya.`,
  safeToClose: "Anda dapat menutup jendela ini sekarang.",
  expiredTitle: "Undangan ini sudah kedaluwarsa",
  expiredBody:
    "Tautan wawancara ini sudah tidak berlaku. Jika Anda masih ingin mengikuti wawancara, silakan hubungi perekrut yang mengundang Anda untuk meminta undangan baru.",
  revokedTitle: "Undangan ini sudah tidak aktif",
  revokedBody:
    "Tautan wawancara ini telah dinonaktifkan. Jika menurut Anda ini sebuah kesalahan, silakan hubungi perekrut yang mengundang Anda.",
  invalidTitle: "Tautan wawancara ini tidak valid",
  invalidBody:
    "Kami tidak mengenali tautan ini. Pastikan Anda membuka tautan lengkap dari undangan — beberapa aplikasi email memotong tautan yang panjang.",
  invalidHint: "Jika masih tidak berhasil, silakan hubungi perekrut yang mengundang Anda.",
  incompleteTitle: "Tautan ini tidak lengkap",
  incompleteBody:
    "Tautan wawancara tidak memiliki kode akses pribadi. Buka tautan lengkap dari undangan Anda, atau salin seluruh alamat ke browser.",
  incompleteHint: "Masih bermasalah? Hubungi perekrut yang mengundang Anda.",
  loadFailedTitle: "Wawancara Anda tidak dapat dimuat",
  loadFailedBody: "Biasanya ini masalah koneksi sementara. Periksa koneksi internet Anda lalu coba lagi.",
  answersSaved: "Jawaban yang sudah Anda kirim tetap tersimpan.",
  readyToJoin: "Siap bergabung?",
  lobbyGreeting: (firstName) => (firstName ? `Halo ${firstName},` : "Halo,"),
  lobbyIntro: (jobTitle, companyName) =>
    `Anda diundang ke wawancara AI untuk posisi ${jobTitle} di ${companyName}. Pewawancara AI akan mengajukan pertanyaan dalam Bahasa Indonesia, satu per satu. Jawab dengan suara Anda (atau ketik), seperti wawancara biasa.`,
  aboutMinutes: (minutes) => `± ${minutes} menit`,
  questionsCount: (count) => `${count} pertanyaan`,
  linkValidUntil: (date) => `Berlaku hingga ${date}`,
  cameraPreviewOff: "Kamera mati",
  startingCamera: "Menyalakan kamera…",
  micLevel: "Level mikrofon",
  beforeYouStart: "Sebelum mulai",
  privacyNotice: "Pemberitahuan privasi",
  privacyNoticeText: "Teks pemberitahuan privasi",
  localOnlyNotice:
    "Kamera dan berbagi layar hanya ditampilkan di perangkat Anda — tidak direkam, tidak dianalisis, dan tidak dikirim ke server. Yang disimpan hanya teks jawaban Anda. Saat menjawab dengan suara, browser Anda (mis. Chrome) mengubah suara menjadi teks melalui layanan pengenalan suaranya.",
  consentLabel:
    "Saya telah membaca pemberitahuan privasi dan setuju jawaban saya dicatat serta diproses untuk menilai lamaran saya.",
  consentAlreadyGiven: "Anda sudah memberikan persetujuan. Gabung kembali untuk melanjutkan wawancara.",
  joinNow: "Gabung sekarang",
  rejoin: "Gabung kembali",
  startFailed: "Wawancara tidak dapat dimulai",
  aiNoDecisions: "Jawaban Anda ditinjau oleh tim rekrutmen. AI tidak membuat keputusan perekrutan.",
  checkDevices: "Periksa kamera dan mikrofon Anda",
  deviceDenied:
    "Akses kamera/mikrofon ditolak. Izinkan akses melalui ikon gembok di bilah alamat browser, lalu klik Coba lagi. Anda tetap dapat menjawab dengan mengetik.",
  deviceNotFound: "Kamera atau mikrofon tidak ditemukan. Anda tetap dapat mengikuti wawancara dan menjawab dengan mengetik.",
  deviceInUse: "Kamera atau mikrofon sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu klik Coba lagi.",
  deviceInsecure:
    "Kamera dan mikrofon hanya bisa digunakan melalui koneksi aman (https). Buka tautan undangan persis seperti yang dikirimkan.",
  deviceUnsupported: "Browser ini tidak mendukung akses kamera/mikrofon. Anda tetap dapat menjawab dengan mengetik.",
  deviceError: "Kamera/mikrofon tidak dapat dinyalakan. Anda tetap dapat menjawab dengan mengetik.",
  retryDevices: "Coba lagi",
  recognitionUnsupported:
    "Pengenalan suara paling baik di Google Chrome atau Microsoft Edge. Di browser ini, silakan jawab dengan mengetik.",
  recognitionDenied: "Mikrofon tidak diizinkan untuk pengenalan suara. Silakan jawab dengan mengetik.",
  recognitionNetwork: "Layanan pengenalan suara tidak tersedia saat ini. Silakan jawab dengan mengetik.",
  voiceUnavailable: "Suara pewawancara tidak tersedia di browser ini — pertanyaan ditampilkan sebagai teks.",
  privacyBadge: "Kamera & layar tidak direkam",
  questionOf: (index, total) => `Pertanyaan ${index} dari ${total}`,
  followUp: "Pertanyaan lanjutan",
  interviewInProgress: "Wawancara berlangsung",
  elapsedOf: (elapsed, total) => `${elapsed} / ${total}`,
  aiSpeaking: "Pewawancara sedang berbicara…",
  aiPreparing: "Pewawancara bersiap berbicara…",
  listening: "Mendengarkan… silakan jawab",
  yourTurn: "Giliran Anda menjawab",
  yourTurnTyping: "Giliran Anda — ketik jawaban Anda",
  processing: "Pewawancara sedang memproses jawaban Anda…",
  thinking: "Pewawancara sedang berpikir…",
  micOffHint: "Mikrofon mati — nyalakan untuk menjawab dengan suara, atau ketik jawaban Anda.",
  sharingBanner: "Anda sedang membagikan layar",
  sharingLocalOnly: "Hanya terlihat di perangkat Anda — tidak direkam atau dikirim.",
  stopSharing: "Berhenti berbagi",
  yourScreen: "Layar Anda",
  cameraOff: "Kamera mati",
  micMuted: "Mikrofon mati",
  turnOnMic: "Nyalakan mikrofon",
  turnOffMic: "Matikan mikrofon",
  turnOnCamera: "Nyalakan kamera",
  turnOffCamera: "Matikan kamera",
  shareScreen: "Bagikan layar",
  stopShareScreen: "Berhenti membagikan layar",
  screenShareUnsupported: "Berbagi layar tidak didukung di perangkat ini",
  captionsOn: "Aktifkan teks",
  captionsOff: "Nonaktifkan teks",
  openTranscript: "Buka transkrip",
  closeTranscript: "Tutup transkrip",
  doneAnswering: "Selesai menjawab",
  sending: "Mengirim…",
  endCall: "Akhiri wawancara",
  repeatQuestion: "Ulangi pertanyaan",
  moreControls: "Kontrol",
  yourAnswer: "Jawaban Anda",
  answerPlaceholderVoice: "Bicaralah — jawaban Anda akan muncul di sini dan dapat diedit…",
  answerPlaceholderText: "Ketik jawaban Anda…",
  waitingForInterviewer: "Menunggu pewawancara…",
  answerTooLong: "Jawaban terlalu panjang (maksimal 4.000 karakter).",
  emptyAnswer: "Jawaban masih kosong.",
  sendFailed: "Jawaban Anda belum terkirim.",
  transcript: "Transkrip",
  interviewerLabel: "Pewawancara",
  noMessagesYet: "Belum ada percakapan.",
  endTitle: "Akhiri wawancara sekarang?",
  endTitleAllAnswered: "Kirim wawancara Anda?",
  endBody: (answered, total) =>
    `Anda telah menjawab ${answered} dari ${total} pertanyaan. Jawaban Anda sejauh ini akan dikirim dan Anda tidak dapat melanjutkan.`,
  endBodyAllAnswered: "Jawaban Anda akan dikirim ke tim rekrutmen dan tidak dapat diubah lagi.",
  endConfirm: "Akhiri & kirim",
  keepGoing: "Lanjutkan wawancara",
  completeFailed: "Wawancara Anda belum terkirim.",
};

const en: InterviewCopy = {
  locale: "en-GB",
  onlineInterview: "Online interview",
  candidatePortal: "Candidate portal",
  loading: "Loading your interview…",
  tryAgain: "Try again",
  you: "You",
  thankYouTitle: (firstName) => (firstName ? `Thank you, ${firstName}!` : "Thank you!"),
  completedTitle: "Interview complete",
  completedBody: (jobTitle, companyName) =>
    `Your answers have been submitted${jobTitle ? ` for the ${jobTitle} role` : ""}. The HR team${
      companyName ? ` at ${companyName}` : ""
    } will review them and be in touch about the next steps.`,
  safeToClose: "You can safely close this window now.",
  expiredTitle: "This invitation has expired",
  expiredBody:
    "The link to this interview is no longer valid. If you'd still like to take part, please contact the recruiter who invited you — they can send you a new invitation.",
  revokedTitle: "This invitation is no longer active",
  revokedBody:
    "This interview link has been deactivated. If you think this is a mistake, please contact the recruiter who invited you.",
  invalidTitle: "This interview link isn't valid",
  invalidBody:
    "We couldn't recognise this link. Make sure you opened the complete link from your invitation — some email apps split long links across lines.",
  invalidHint: "If it still doesn't work, please contact the recruiter who invited you.",
  incompleteTitle: "This link is incomplete",
  incompleteBody:
    "The interview link is missing its personal access code. Please open the full link from your invitation, or copy the entire address into your browser.",
  incompleteHint: "Still stuck? Contact the recruiter who invited you.",
  loadFailedTitle: "We couldn't load your interview",
  loadFailedBody: "This is usually a temporary connection problem. Check your internet connection and try again.",
  answersSaved: "Any answers you've already sent are saved.",
  readyToJoin: "Ready to join?",
  lobbyGreeting: (firstName) => (firstName ? `Hi ${firstName},` : "Hi there,"),
  lobbyIntro: (jobTitle, companyName) =>
    `You've been invited to an AI interview for the ${jobTitle} role at ${companyName}. The AI interviewer asks the questions one at a time. Answer with your voice (or by typing), just like a normal interview.`,
  aboutMinutes: (minutes) => `About ${minutes} minutes`,
  questionsCount: (count) => `${count} question${count === 1 ? "" : "s"}`,
  linkValidUntil: (date) => `Valid until ${date}`,
  cameraPreviewOff: "Camera is off",
  startingCamera: "Starting camera…",
  micLevel: "Microphone level",
  beforeYouStart: "Before you start",
  privacyNotice: "Privacy notice",
  privacyNoticeText: "Privacy notice text",
  localOnlyNotice:
    "Your camera and screen sharing are only shown on your own device — they are never recorded, analysed or uploaded. Only the text of your answers is saved. When you answer by voice, your browser (e.g. Chrome) turns speech into text using its speech recognition service.",
  consentLabel:
    "I have read the privacy notice and agree to my answers being recorded and processed to assess my application.",
  consentAlreadyGiven: "You've already given consent. Rejoin to continue your interview.",
  joinNow: "Join now",
  rejoin: "Rejoin",
  startFailed: "We couldn't start the interview",
  aiNoDecisions: "Your answers are reviewed by the hiring team. The AI doesn't make hiring decisions.",
  checkDevices: "Check your camera and microphone",
  deviceDenied:
    "Camera/microphone access was blocked. Allow access from the lock icon in your browser's address bar, then click Try again. You can still answer by typing.",
  deviceNotFound: "No camera or microphone was found. You can still take the interview and answer by typing.",
  deviceInUse: "Your camera or microphone is being used by another app. Close it and click Try again.",
  deviceInsecure:
    "Camera and microphone only work over a secure (https) connection. Open the invitation link exactly as it was sent.",
  deviceUnsupported: "This browser doesn't support camera/microphone access. You can still answer by typing.",
  deviceError: "Your camera/microphone couldn't be started. You can still answer by typing.",
  retryDevices: "Try again",
  recognitionUnsupported:
    "Voice answers work best in Google Chrome or Microsoft Edge. In this browser, please type your answers.",
  recognitionDenied: "The microphone isn't allowed for speech recognition. Please type your answers.",
  recognitionNetwork: "The speech recognition service isn't available right now. Please type your answers.",
  voiceUnavailable: "The interviewer's voice isn't available in this browser — questions are shown as text.",
  privacyBadge: "Camera & screen aren't recorded",
  questionOf: (index, total) => `Question ${index} of ${total}`,
  followUp: "Follow-up question",
  interviewInProgress: "Interview in progress",
  elapsedOf: (elapsed, total) => `${elapsed} / ${total}`,
  aiSpeaking: "The interviewer is speaking…",
  aiPreparing: "The interviewer is getting ready to speak…",
  listening: "Listening… go ahead and answer",
  yourTurn: "Your turn to answer",
  yourTurnTyping: "Your turn — type your answer",
  processing: "The interviewer is reviewing your answer…",
  thinking: "The interviewer is thinking…",
  micOffHint: "Your microphone is off — turn it on to answer by voice, or type your answer.",
  sharingBanner: "You are sharing your screen",
  sharingLocalOnly: "Only visible on your device — not recorded or uploaded.",
  stopSharing: "Stop sharing",
  yourScreen: "Your screen",
  cameraOff: "Camera off",
  micMuted: "Microphone off",
  turnOnMic: "Turn on microphone",
  turnOffMic: "Turn off microphone",
  turnOnCamera: "Turn on camera",
  turnOffCamera: "Turn off camera",
  shareScreen: "Share screen",
  stopShareScreen: "Stop sharing screen",
  screenShareUnsupported: "Screen sharing isn't supported on this device",
  captionsOn: "Turn on captions",
  captionsOff: "Turn off captions",
  openTranscript: "Open transcript",
  closeTranscript: "Close transcript",
  doneAnswering: "Done answering",
  sending: "Sending…",
  endCall: "End interview",
  repeatQuestion: "Repeat question",
  moreControls: "Controls",
  yourAnswer: "Your answer",
  answerPlaceholderVoice: "Speak — your answer appears here and can be edited…",
  answerPlaceholderText: "Type your answer…",
  waitingForInterviewer: "Waiting for the interviewer…",
  answerTooLong: "Your answer is too long (4,000 characters max).",
  emptyAnswer: "Your answer is empty.",
  sendFailed: "Your answer wasn't sent.",
  transcript: "Transcript",
  interviewerLabel: "Interviewer",
  noMessagesYet: "No conversation yet.",
  endTitle: "End the interview now?",
  endTitleAllAnswered: "Submit your interview?",
  endBody: (answered, total) =>
    `You've answered ${answered} of ${total} questions. Your answers so far will be submitted and you won't be able to continue.`,
  endBodyAllAnswered: "Your answers will be submitted to the hiring team. You won't be able to change them afterwards.",
  endConfirm: "End & submit",
  keepGoing: "Keep going",
  completeFailed: "We couldn't submit your interview.",
};

export const interviewCopy: Record<InterviewLanguage, InterviewCopy> = { id, en };

/** Language before the API has answered (loading / invalid link): follow the browser. */
export function detectBrowserLanguage(languages: readonly string[] | undefined = globalThis.navigator?.languages): InterviewLanguage {
  const first = languages?.[0]?.toLowerCase() ?? "";
  return first.startsWith("id") || first.startsWith("in") ? "id" : "en";
}

export const InterviewCopyContext = createContext<InterviewCopy>(id);

export function useInterviewCopy(): InterviewCopy {
  return useContext(InterviewCopyContext);
}

/** Candidate-facing explanation for a camera / microphone failure. */
export function mediaErrorMessage(t: InterviewCopy, kind: MediaErrorKind): string {
  switch (kind) {
    case "denied":
      return t.deviceDenied;
    case "not-found":
      return t.deviceNotFound;
    case "in-use":
      return t.deviceInUse;
    case "insecure":
      return t.deviceInsecure;
    case "unsupported":
      return t.deviceUnsupported;
    default:
      return t.deviceError;
  }
}

export function formatInterviewDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
