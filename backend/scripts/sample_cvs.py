"""Synthetic CVs for demos and tests. All people, contacts and employers are fictional.

Run ``python -m scripts.sample_cvs`` to write the files to ``sample_cvs/``.
"""

from __future__ import annotations

import io
from pathlib import Path

SAMPLE_CVS: list[dict] = [
    {
        "file": "rina_wijaya_data_scientist.pdf",
        "lines": [
            "RINA WIJAYA",
            "Data Scientist | Jakarta Selatan, Indonesia",
            "rina.wijaya@example.com | +62 812-3456-7890 | linkedin.com/in/rinawijaya-demo",
            "",
            "PROFESSIONAL SUMMARY",
            "Data scientist with 5+ years of experience building machine learning models for e-commerce and fintech.",
            "Comfortable taking models from notebook to production with MLOps practices.",
            "",
            "WORK EXPERIENCE",
            "Senior Data Scientist - PT Nusantara Digital Commerce",
            "Mar 2022 - Present",
            "- Built demand forecasting models with XGBoost and PyTorch, reducing stock-outs by 18%.",
            "- Deployed models as REST APIs using FastAPI and Docker on AWS.",
            "- Mentored 3 junior analysts and led weekly model review sessions.",
            "Data Scientist - PT Bank Contoh Sejahtera Tbk",
            "Jan 2019 - Feb 2022",
            "- Developed credit scoring models using sklearn and Pandas on 2M+ customer records.",
            "- Wrote complex queries in Postgre SQL and BigQuery for feature engineering.",
            "- Presented A/B testing results to product and risk stakeholders.",
            "Data Analyst Intern - CV Analitika Muda",
            "Jun 2018 - Dec 2018",
            "- Created Tableau dashboards for sales reporting.",
            "",
            "EDUCATION",
            "Universitas Indonesia",
            "S1 Statistika, 2014 - 2018, IPK 3.71/4.00",
            "",
            "SKILLS",
            "Python, SQL, scikit-learn, PyTorch framework, XGBoost, Pandas, NumPy, Tableau, Airflow, Docker, Git",
            "Machine Learning, Deep Learning, NLP, Statistics, A/B Testing",
            "",
            "CERTIFICATIONS",
            "- AWS Certified Machine Learning - Specialty (2023)",
            "- TensorFlow Developer Certificate (2021)",
            "",
            "LANGUAGES",
            "Indonesian (Native), English (Fluent)",
        ],
    },
    {
        "file": "budi_santoso_backend_engineer.docx",
        "lines": [
            "Budi Santoso",
            "Backend Engineer",
            "Email: budi.santoso@example.com",
            "Phone: 0813 9876 5432",
            "Alamat: Bandung, Jawa Barat",
            "",
            "Summary",
            "Backend engineer focused on scalable microservices and clean API design.",
            "",
            "Experience",
            "Backend Engineer at PT Solusi Awan Teknologi | Aug 2021 - Present",
            "- Designed microservices in Go and Node.js serving 5 million requests per day.",
            "- Migrated monolith to Kubernetes with Helm and GitHub Actions CI/CD.",
            "- Optimised PostgreSQL queries and introduced Redis caching.",
            "Software Engineer at PT Kreasi Kode Indonesia | Jul 2019 - Jul 2021",
            "- Built REST API services using Laravel and MySQL.",
            "- Wrote unit tests with PHPUnit and Jest.",
            "",
            "Education",
            "Institut Teknologi Bandung",
            "Bachelor of Informatics, 2015 - 2019",
            "",
            "Technical Skills",
            "Languages: Go, JavaScript, TypeScript, PHP, SQL",
            "Frameworks: Node.js, Express, Laravel, NestJS",
            "Infrastructure: Docker, Kubernetes, AWS, Terraform, Linux, Nginx",
            "Databases: PostgreSQL, MySQL, Redis, MongoDB",
            "",
            "Certifications",
            "Certified Kubernetes Application Developer (CKAD)",
        ],
    },
    {
        "file": "siti_rahmawati_hr_generalist.docx",
        "lines": [
            "CURRICULUM VITAE",
            "Nama: Siti Rahmawati",
            "Email: siti.rahmawati@example.com",
            "No. HP: 0857-1122-3344",
            "Domisili: Surabaya",
            "",
            "Ringkasan",
            "Profesional HR dengan pengalaman di rekrutmen, penggajian, dan hubungan industrial.",
            "",
            "Pengalaman Kerja",
            "HR Generalist",
            "PT Sinar Logistik Nusantara",
            "Januari 2020 - Sekarang",
            "- Mengelola proses rekrutmen end-to-end untuk 120+ posisi per tahun.",
            "- Menyusun penggajian bulanan untuk 450 karyawan menggunakan HRIS.",
            "- Menangani hubungan industrial dan penyusunan PKB.",
            "Staff Rekrutmen",
            "PT Retail Makmur Bersama",
            "Maret 2017 - Desember 2019",
            "- Melakukan sourcing kandidat melalui job portal dan media sosial.",
            "- Menyelenggarakan psikotes dan wawancara awal.",
            "",
            "Pendidikan",
            "Universitas Airlangga",
            "S1 Psikologi, 2013 - 2017",
            "",
            "Keahlian",
            "Rekrutmen, Penggajian, Hubungan Industrial, HRIS, Microsoft Excel, Komunikasi, Negosiasi",
            "",
            "Sertifikasi",
            "Sertifikasi BNSP Manajemen SDM (2021)",
            "",
            "Bahasa",
            "Bahasa Indonesia (Aktif), Bahasa Inggris (Pasif)",
        ],
    },
    {
        "file": "andi_pratama_frontend_developer.pdf",
        "lines": [
            "Andi Pratama",
            "Frontend Developer · Yogyakarta",
            "andi.pratama@example.com · +62 878 5555 0101",
            "",
            "About Me",
            "Frontend developer who enjoys building accessible, fast web interfaces.",
            "",
            "Work Experience",
            "PT Aplikasi Kreatif Jogja",
            "Frontend Developer",
            "04/2022 - Present",
            "- Built React and TypeScript dashboards used by 200+ merchants.",
            "- Introduced Tailwind CSS design system and Storybook documentation.",
            "Freelance Web Developer",
            "2020 - 2022",
            "- Delivered 15 company profile websites with Vue.js and Laravel.",
            "",
            "Education",
            "Universitas Gadjah Mada",
            "D3 Teknik Informatika, 2017 - 2020",
            "",
            "Skills",
            "React, TypeScript, JavaScript, HTML, CSS, Tailwind, Vue.js, Figma, Git, Jest, Storybook",
        ],
    },
    {
        "file": "dewi_lestari_data_analyst.pdf",
        "lines": [
            "DEWI LESTARI",
            "dewi.lestari@example.com | 0821 7777 8888 | Medan",
            "",
            "PROFILE",
            "Detail-oriented data analyst with experience in retail analytics and reporting automation.",
            "",
            "EXPERIENCE",
            "Data Analyst | PT Mitra Retail Sumatera | Feb 2021 - Present",
            "- Automated weekly sales reports with Python and Power BI, saving 10 hours per week.",
            "- Maintained SQL data marts in MySQL for 40 store branches.",
            "Business Intelligence Intern | PT Data Prima | Aug 2020 - Jan 2021",
            "- Cleaned and visualised survey data in Excel and Looker Studio.",
            "",
            "EDUCATION",
            "Universitas Sumatera Utara - Bachelor of Mathematics, 2016 - 2020, GPA 3.55/4.00",
            "",
            "SKILLS",
            "SQL, Python, Pandas, Power BI, Excel, Looker Studio, Statistics, Data Visualization",
            "",
            "LANGUAGES",
            "Indonesian, English (Intermediate)",
        ],
    },
    {
        "file": "agus_hidayat_devops_engineer.docx",
        "lines": [
            "Agus Hidayat",
            "DevOps Engineer | Remote",
            "agus.hidayat@example.com",
            "",
            "Professional Experience",
            "DevOps Engineer - PT Cloud Andalan Indonesia",
            "Sep 2020 - Present",
            "- Managed Kubernetes clusters on Google Cloud Platform and AWS.",
            "- Built CI/CD with Jenkins and GitLab CI; infrastructure as code with Terraform and Ansible.",
            "- Set up monitoring with Prometheus and Grafana.",
            "System Administrator - PT Jaringan Data Kita",
            "Jan 2018 - Aug 2020",
            "- Administered Linux servers and Nginx; scripted maintenance in Bash and Python.",
            "Network Support - PT Jaringan Data Kita",
            "Jun 2019 - Dec 2019",
            "- Covered network operations during a team transition.",
            "",
            "Education",
            "Politeknik Negeri Jakarta - Diploma IV Teknik Komputer Jaringan (2014 - 2018)",
            "",
            "Skills: Kubernetes, Docker, Terraform, Ansible, Jenkins, GitLab CI, AWS, GCP, Linux, Bash, Python, Prometheus, Grafana",
            "",
            "Certifications",
            "Certified Kubernetes Administrator (CKA)",
            "AWS Certified Solutions Architect - Associate",
        ],
    },
]


def _write_docx(lines: list[str]) -> bytes:
    import docx

    document = docx.Document()
    for line in lines:
        document.add_paragraph(line)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


def _write_pdf(lines: list[str]) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    for i, line in enumerate(lines):
        text = line.replace("·", "|").replace("–", "-")
        if i == 0:
            pdf.set_font("Helvetica", "B", 16)
        elif line.isupper() and len(line) < 40:
            pdf.set_font("Helvetica", "B", 11)
        else:
            pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, text or " ", new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def render(sample: dict) -> bytes:
    return _write_pdf(sample["lines"]) if sample["file"].endswith(".pdf") else _write_docx(sample["lines"])


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "sample_cvs"
    out.mkdir(exist_ok=True)
    for sample in SAMPLE_CVS:
        (out / sample["file"]).write_bytes(render(sample))
        print("wrote", out / sample["file"])
