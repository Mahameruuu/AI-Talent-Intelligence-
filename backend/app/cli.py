"""Flask CLI command: ``flask --app app:create_app seed-demo``."""

from __future__ import annotations

from datetime import datetime, timezone

import click
from flask import Flask
from sqlalchemy import delete

from .extensions import db
from .models import Application, ApplicationForm, Candidate, Document, HRReview, InterviewTemplate, Job, JobCompetency, StageHistory
from .nlp.matching import DEFAULT_WEIGHTS
from .security import DEFAULT_ACTOR_NAME, find_or_create_actor

DEMO_JOBS = [
    {
        "title": "Data Scientist", "department": "Data & AI", "location": "Jakarta (Hybrid)",
        "description": ("We are looking for a Data Scientist to build, evaluate and deploy machine learning models for "
                        "demand forecasting and customer analytics. You will work with large datasets in SQL, design "
                        "experiments (A/B testing), and collaborate with engineers to put models into production."),
        "required": ["Python", "SQL", "Machine Learning", "scikit-learn", "Statistics"],
        "preferred": ["PyTorch", "Apache Airflow", "AWS", "Docker"],
        "min_years": 3, "edu": "bachelor", "field": "Statistics, Mathematics or Computer Science", "certs": [],
    },
    {
        "title": "Backend Engineer", "department": "Engineering", "location": "Bandung / Remote",
        "description": ("Design and operate scalable backend services and REST APIs. You will build microservices, "
                        "model data in PostgreSQL, containerise services with Docker and improve reliability."),
        "required": ["Go", "PostgreSQL", "Docker", "REST API", "Microservices"],
        "preferred": ["Kubernetes", "Redis", "AWS", "CI/CD"],
        "min_years": 3, "edu": "bachelor", "field": "Computer Science or Informatics", "certs": [],
    },
    {
        "title": "HR Generalist", "department": "People", "location": "Surabaya",
        "description": ("Own end-to-end recruitment, payroll administration and employee relations for our operations "
                        "sites. Maintain HRIS data quality and support training programmes."),
        "required": ["Recruitment", "Payroll", "Employee Relations", "HRIS"],
        "preferred": ["Microsoft Excel", "Training & Development"],
        "min_years": 2, "edu": "bachelor", "field": "Psychology or Management", "certs": ["BNSP"],
    },
    {
        "title": "Frontend Developer", "department": "Engineering", "location": "Yogyakarta",
        "description": ("Build accessible, fast web interfaces with React and TypeScript, working closely with "
                        "designers in Figma and maintaining a component library."),
        "required": ["React", "TypeScript", "HTML", "CSS"],
        "preferred": ["Next.js", "Figma", "Unit Testing"],
        "min_years": 2, "edu": "diploma", "field": None, "certs": [],
    },
]

# (sample file, job title)
DEMO_APPLICATIONS = [
    ("rina_wijaya_data_scientist.pdf", "Data Scientist"),
    ("dewi_lestari_data_analyst.pdf", "Data Scientist"),
    ("budi_santoso_backend_engineer.docx", "Backend Engineer"),
    ("agus_hidayat_devops_engineer.docx", "Backend Engineer"),
    ("siti_rahmawati_hr_generalist.docx", "HR Generalist"),
    ("andi_pratama_frontend_developer.pdf", "Frontend Developer"),
]

# Demo answers to the default form fields: (city, expected salary, start date, motivation).
DEMO_FORM_ANSWERS = {
    "rina_wijaya_data_scientist.pdf": ("Jakarta", 28000000, "1-3 months",
                                       "I want to apply forecasting work to larger, more varied data."),
    "dewi_lestari_data_analyst.pdf": ("Medan", 15000000, "Within 1 month",
                                      "I'd like to grow from analytics into machine learning."),
    "budi_santoso_backend_engineer.docx": ("Bandung", 25000000, "1-3 months", None),
    "agus_hidayat_devops_engineer.docx": ("Jakarta", 22000000, "Immediately",
                                          "Looking to move closer to backend development."),
    "siti_rahmawati_hr_generalist.docx": ("Surabaya", 12000000, "Within 1 month", None),
    "andi_pratama_frontend_developer.pdf": ("Yogyakarta", 14000000, "Immediately",
                                            "I enjoy building design systems and accessible interfaces."),
}

# Synthetic answers (Bahasa Indonesia) in question order: 2 CV-based questions, then the 5 template questions.
DEMO_INTERVIEW_ANSWERS = [
    "Sebagai Senior Data Scientist di PT Nusantara Digital Commerce saya bertanggung jawab atas model demand "
    "forecasting untuk 300 produk dan mendampingi 3 analis junior. Pencapaian yang paling saya banggakan adalah "
    "menurunkan stock-out sebesar 18 persen dalam dua kuartal setelah model baru kami dipakai tim supply chain.",
    "Saya memakai scikit-learn untuk model credit scoring di PT Bank Contoh Sejahtera. Masalahnya, model lama sering "
    "salah menilai nasabah baru. Saya membuat fitur dari data transaksi, membandingkan logistic regression dan gradient "
    "boosting, lalu memvalidasi dengan data out-of-time. Hasilnya AUC naik dari 0,71 menjadi 0,78.",
    "Nama saya Rina Wijaya, data scientist dengan pengalaman sekitar 8 tahun di e-commerce dan perbankan. Saya terbiasa "
    "membawa model dari notebook sampai produksi, dan saya tertarik dengan posisi ini karena fokusnya pada forecasting.",
    "Proyek terakhir saya adalah sistem forecasting permintaan. Saya membandingkan baseline musiman dengan XGBoost, "
    "membuat fitur hari libur dan promo di SQL, lalu men-deploy dengan FastAPI dan Docker. Stock-out turun 18 persen.",
    "Akurasi forecast tiba-tiba turun untuk satu wilayah. Saya memeriksa data input dan menemukan perubahan cara partner "
    "melaporkan retur, sehingga penjualan tampak negatif. Saya menambahkan validasi data di pipeline dan melatih ulang "
    "model; dalam seminggu error kembali ke level sebelumnya.",
    "Approval rate model kredit kami turun 6 persen setelah perubahan kebijakan. Saya memecah populasi per kanal dan "
    "menemukan satu partner mengirim data penghasilan yang tidak lengkap. Saya mengusulkan fitur cadangan dan kontrak "
    "data dengan partner, dan approval rate pulih dalam satu bulan.",
    "Saya pernah berbeda pendapat dengan product manager soal meluncurkan model sebelum A/B test. Saya menjelaskan "
    "risikonya dengan grafik sederhana dan kami sepakat menjalankan tes dua minggu. Hasilnya uplift lebih kecil dari "
    "perkiraan, jadi kami menyesuaikan rencana rollout bersama.",
]
DEMO_FOLLOW_UP_ANSWER = ("Hasilnya terukur: metrik yang kami pantau membaik dan tim menjadikan pendekatan itu standar "
                         "kerja selama 2 kuartal berikutnya.")


def _reset_demo() -> None:
    from .services import storage

    keys = [d.storage_key for d in Document.query.join(Candidate).filter(Candidate.is_demo.is_(True)).all()]
    db.session.execute(delete(Candidate).where(Candidate.is_demo.is_(True)))
    db.session.execute(delete(Job).where(Job.is_demo.is_(True)))
    db.session.commit()
    root = storage._root()
    for key in keys:
        (root / key).unlink(missing_ok=True)


def register_cli(app: Flask) -> None:
    @app.cli.command("seed-demo")
    @click.option("--reset", is_flag=True, help="Delete existing demo data first.")
    def seed_demo(reset: bool) -> None:
        """Create demo jobs and candidates. Synthetic CVs are processed by the real NLP pipeline."""
        from scripts.sample_cvs import SAMPLE_CVS, render

        from .services import documents, interviews
        from .services.screening import run_screening
        from .worker import worker

        worker.inline = True  # process CVs and evaluations synchronously while seeding
        hr = find_or_create_actor(None, DEFAULT_ACTOR_NAME)  # demo actions are attributed to the built-in "HR" actor
        db.session.commit()
        if reset:
            _reset_demo()
        elif Job.query.filter_by(is_demo=True).first():
            click.echo("Demo data already present (use --reset to recreate).")
            return

        jobs: dict[str, Job] = {}
        for spec in DEMO_JOBS:
            job = Job(title=spec["title"], department=spec["department"], location=spec["location"],
                      description=spec["description"], min_experience_years=spec["min_years"],
                      education_level=spec["edu"], education_field=spec["field"], status="open",
                      weights=dict(DEFAULT_WEIGHTS), is_demo=True, created_by_id=hr.id)
            for kind, names in (("required_skill", spec["required"]), ("preferred_skill", spec["preferred"]),
                                ("certification", spec["certs"])):
                for i, name in enumerate(names):
                    job.competencies.append(JobCompetency(kind=kind, name=name, position=i))
            db.session.add(job)
            jobs[spec["title"]] = job
        db.session.commit()

        from .services import forms as form_service

        job_forms: dict[str, ApplicationForm] = {}
        for title, job in jobs.items():
            form = ApplicationForm(job_id=job.id, slug=form_service.new_slug(), title=f"Apply: {title}",
                                   intro="Thank you for your interest in joining us. The form takes about 5 minutes.",
                                   fields=form_service.default_fields(), status="published",
                                   published_at=datetime.now(timezone.utc))
            db.session.add(form)
            job_forms[title] = form
        db.session.commit()

        samples = {s["file"]: s for s in SAMPLE_CVS}
        apps: dict[str, Application] = {}
        for filename, job_title in DEMO_APPLICATIONS:
            candidate = Candidate(full_name=f"Processing {filename}", name_pending=True, is_demo=True)
            db.session.add(candidate)
            db.session.flush()
            form = job_forms[job_title]
            city, salary, notice, motivation = DEMO_FORM_ANSWERS[filename]
            answers = [{"field_id": f["id"], "label": f["label"], "type": f["type"], "value": v}
                       for f, v in zip(form.fields, (city, salary, notice, motivation))]
            application = Application(candidate_id=candidate.id, job_id=jobs[job_title].id, stage="applied", is_demo=True,
                                      source="public_form", form_id=form.id, form_answers=answers,
                                      submitted_at=datetime.now(timezone.utc))
            db.session.add(application)
            db.session.flush()
            db.session.add(StageHistory(application_id=application.id, to_stage="applied",
                                        changed_by_id=hr.id, note="Demo data"))
            db.session.commit()
            doc, _ = documents.create_document(application, filename, render(samples[filename]), hr.id)
            documents.process_document_job(doc.id)  # synchronous for seeding
            db.session.refresh(application)
            if not application.screenings:
                run_screening(application)
            apps[filename] = application
            click.echo(f"  {application.candidate.full_name:<20} -> {job_title:<20} score {application.match_score}")

        # A reviewed application and an approved interview template with one completed demo interview.
        budi = apps["budi_santoso_backend_engineer.docx"]
        db.session.add(HRReview(application_id=budi.id, screening_result_id=budi.screenings[0].id,
                                reviewer_id=hr.id, recommendation="advance",
                                notes="Demo review: strong microservices background; confirm Go depth in interview.",
                                evidence_validations={r["key"]: "confirmed" for r in budi.screenings[0].requirements
                                                      if r["status"] == "matched"}))
        db.session.commit()

        ds = jobs["Data Scientist"]
        suggestion = interviews.suggest_template(ds)
        clean = interviews.validate_template_payload(suggestion)
        template = InterviewTemplate(job_id=ds.id, status="approved", approved_by_id=hr.id, **clean)
        db.session.add(template)
        db.session.commit()

        rina = apps["rina_wijaya_data_scientist.pdf"]
        session, _raw = interviews.create_session(rina, template, hr.id)
        interviews.start(session, consent=True)
        for _ in range(len(DEMO_INTERVIEW_ANSWERS) * 3):
            db.session.refresh(session)
            if session.status != "in_progress":
                break
            last = session.messages[-1]
            answer = DEMO_FOLLOW_UP_ANSWER if last.is_follow_up else DEMO_INTERVIEW_ANSWERS[session.current_question_index]
            interviews.post_answer(session, answer)
        db.session.refresh(session)
        if session.status != "completed":
            interviews.complete(session, by="hr")
        evaluation = session.evaluations[0] if session.evaluations else None
        if evaluation and evaluation.status in ("pending", "processing"):
            interviews.evaluate_job(evaluation.id)  # synchronous for seeding
        click.echo(f"  Demo interview for {rina.candidate.full_name}: {session.status}")

        # Shortlist the strongest remaining candidates so the shortlist -> invite flow can be demonstrated.
        for filename in ("budi_santoso_backend_engineer.docx", "andi_pratama_frontend_developer.pdf"):
            a = apps[filename]
            db.session.add(StageHistory(application_id=a.id, from_stage=a.stage, to_stage="shortlisted",
                                        changed_by_id=hr.id, note="Demo data: shortlisted from AI ranking."))
            a.stage = "shortlisted"
        db.session.commit()
        click.echo("Demo data created.")
