import {
  Brain,
  ClipboardList,
  FileLock2,
  FileText,
  Globe,
  KeyRound,
  Link2,
  Map as MapIcon,
  Server,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui";
import { useDataRetention } from "@/hooks/queries/system";

interface Section {
  id: string;
  icon: LucideIcon;
  title: string;
  points: ReactNode[];
}

/** Security headers sent by the API on every response (see backend/app/__init__.py). */
const SECURITY_HEADERS = [
  "Content-Security-Policy",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Referrer-Policy: no-referrer",
  "Permissions-Policy (kamera & mikrofon hanya untuk aplikasi ini)",
  "Cross-Origin-Opener-Policy",
  "Cache-Control: no-store (data pribadi tidak disimpan di cache browser)",
  "Strict-Transport-Security (saat HTTPS)",
];

const SECTIONS: Section[] = [
  {
    id: "akses",
    icon: KeyRound,
    title: "Akses & autentikasi",
    points: [
      "Akses ke API HR dikendalikan oleh sistem pusat: login, autentikasi, dan hak akses pengguna HR ditangani oleh sistem pusat, bukan oleh layanan ini.",
      "API ini wajib berada di belakang API gateway sistem pusat / di jaringan privat dan tidak boleh dibuka langsung ke internet publik. Browser hanya diizinkan dari asal (origin) yang terdaftar (CORS).",
      "Header X-Actor-Name (dan X-Actor-Id) dari sistem pusat hanya dipakai untuk mencatat siapa yang melakukan aksi di log audit — bukan untuk memberi izin akses.",
    ],
  },
  {
    id: "cv",
    icon: FileLock2,
    title: "Perlindungan dokumen CV",
    points: [
      "File CV disimpan privat di server — tidak ada link publik.",
      "Isi file divalidasi (harus benar-benar PDF atau DOCX, bukan hanya nama file).",
      "Ukuran maksimal 10 MB per file.",
    ],
  },
  {
    id: "interview",
    icon: Link2,
    title: "Link AI interview",
    points: [
      "Setiap kandidat mendapat token unik; sistem hanya menyimpan hash-nya.",
      "Link berlaku 72 jam (dapat diatur per template) dan dapat dicabut oleh HR kapan saja.",
      "Token disensor di log email.",
      "Kamera & mikrofon tidak direkam — yang disimpan hanya transkrip teks.",
    ],
  },
  {
    id: "formulir",
    icon: FileText,
    title: "Formulir lamaran",
    points: [
      "Pelamar wajib menyetujui pemberitahuan privasi (consent) sebelum mengirim.",
      "Jumlah pengiriman dibatasi per jaringan (alamat IP) per jam.",
      "Perlindungan anti-bot (kolom jebakan yang hanya diisi bot).",
    ],
  },
  {
    id: "ai",
    icon: Brain,
    title: "AI yang adil & dapat dijelaskan",
    points: [
      "Skor CV dihitung dengan aturan yang transparan; bobotnya terlihat di Pengaturan.",
      "AI tidak pernah menolak kandidat secara otomatis — keputusan akhir selalu oleh HR.",
      "AI interview dilarang menanyakan usia, agama, suku, status pernikahan, dan kesehatan.",
      "Setiap penilaian interview wajib disertai kutipan bukti dari jawaban kandidat.",
    ],
  },
  {
    id: "audit",
    icon: ClipboardList,
    title: "Jejak audit",
    points: [
      "Aksi penting tercatat: siapa, apa, dan kapan.",
      "Setelah data kandidat dihapus, catatan audit hanya menyimpan jumlah — tanpa data pribadi.",
    ],
  },
];

const THIRD_PARTIES = [
  "Teks CV dan transkrip interview diproses oleh penyedia AI (Groq, Google Gemini).",
  "Suara pewawancara AI dibuat oleh layanan text-to-speech Google.",
  "Pengenal suara bawaan browser (Chrome) memproses audio jawaban kandidat di server Google.",
  "Prototipe ini memakai layanan tingkat gratis (free tier).",
];

const ROADMAP = [
  "HTTPS/TLS di semua koneksi",
  "Enkripsi database & file (at rest)",
  "Deploy di region Jakarta atau di server klien (sesuai UU PDP)",
  "Layanan AI enterprise tanpa pemakaian data untuk training, atau model self-hosted",
  "Backup terenkripsi",
  "Pentest & sertifikasi ISO 27001",
  "SSO / 2FA melalui sistem pusat",
];

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 marker:text-slate-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader icon={<Icon />} title={title} />
      <CardContent className="py-4">{children}</CardContent>
    </Card>
  );
}

function RetentionStatus() {
  const query = useDataRetention();
  if (query.isPending) return <span className="text-slate-500">Memuat status retensi…</span>;
  if (query.isError) return <span className="text-slate-500">Status retensi tidak dapat dimuat.</span>;
  const { enabled, months_after_close: months, keep_hired: keepHired } = query.data;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="retention-status">
      Retensi otomatis:
      <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Aktif" : "Nonaktif"}</Badge>
      {enabled
        ? `data pelamar dihapus ${months} bulan setelah lowongan ditutup${keepHired ? " (data kandidat yang diterima disimpan)" : ""}.`
        : `belum diaktifkan (pengaturan: ${months} bulan setelah lowongan ditutup).`}
    </span>
  );
}

/**
 * Settings → Security & privacy: read-only overview for clients (Bahasa Indonesia). Only lists what the system
 * actually does; production plans are marked "Rencana produksi". Mirrors docs/keamanan-dan-privasi-data.md.
 */
export function SecurityPrivacyPanel() {
  return (
    <div className="space-y-6" lang="id">
      <Card>
        <CardHeader
          icon={<ShieldCheck />}
          title="Keamanan & privasi data"
          description="Ringkasan perlindungan data pelamar di XORCA Talent Intelligence. Hanya mencantumkan yang sudah berjalan; rencana untuk produksi ditandai terpisah."
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <section key={section.id} aria-label={section.title}>
            <SectionCard icon={section.icon} title={section.title}>
              <Points items={section.points} />
            </SectionCard>
          </section>
        ))}

        <section aria-label="Hak subjek data (UU PDP)">
          <SectionCard icon={UserCheck} title="Hak subjek data (UU PDP)">
            <Points
              items={[
                "HR dapat menghapus kandidat secara tuntas: CV, skor, review, transkrip interview, dan log email.",
                <RetentionStatus key="retention" />,
                "Kandidat dengan AI interview yang sedang berjalan tidak ikut dihapus otomatis.",
              ]}
            />
          </SectionCard>
        </section>

        <section aria-label="Keamanan server">
          <SectionCard icon={Server} title="Keamanan server">
            <p className="mb-2 text-sm text-slate-700">Setiap respons API mengirim security headers:</p>
            <Points items={SECURITY_HEADERS} />
            <p className="mt-2 text-sm text-slate-700">Rahasia dan API key hanya disimpan di server, tidak pernah dikirim ke browser.</p>
          </SectionCard>
        </section>

        <section aria-label="Pihak ketiga (transparan)">
          <SectionCard icon={Globe} title="Pihak ketiga (transparan)">
            <Points items={THIRD_PARTIES} />
          </SectionCard>
        </section>

        <section aria-label="Rencana produksi">
          <SectionCard icon={MapIcon} title="Rencana produksi">
            <div className="mb-2">
              <Badge tone="warning">Rencana produksi — belum aktif di prototipe</Badge>
            </div>
            <Points items={ROADMAP} />
          </SectionCard>
        </section>
      </div>
    </div>
  );
}
