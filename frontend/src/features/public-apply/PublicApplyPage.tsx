import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { Alert, Button, Checkbox } from "@/components/ui";
import { CandidateLayout } from "@/features/candidate-interview/components/CandidateLayout";
import {
  initialAnswers,
  validateAnswer,
  validateAnswers,
  type AnswerErrors,
  type AnswerValue,
  type AnswerValues,
} from "@/features/application-forms/answer-schema";
import { ApplicationFormFields } from "@/features/application-forms/components/ApplicationFormFields";
import { CvDropzone } from "@/features/application-forms/components/CvDropzone";
import { builtInContactFields, withBuiltInFallback } from "@/features/application-forms/form-fields";
import { usePublicForm } from "@/hooks/queries/forms";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isNotFoundError } from "@/services/api-client";
import { publicFormsApi } from "@/services/forms-api";
import type { ApplicationSubmitted, PublicApplicationForm } from "@/types/api";
import { classifySubmitError, toClosedReason, type ClosedReason } from "./apply-utils";
import {
  AlreadyAppliedScreen,
  ApplicationsClosedScreen,
  ApplyLoadingScreen,
  InvalidLinkScreen,
  LoadErrorScreen,
  RateLimitedScreen,
  SubmittedScreen,
} from "./components/ApplyStatusScreens";
import { JobSummary } from "./components/JobSummary";

const ID_PREFIX = "apply";
const CV_FIELD_ID = "cv";
/** Not a field id the server can assign (built-in ids are reserved), so it never collides. */
const CONSENT_KEY = "__consent";
const CV_REQUIRED_MESSAGE = "Please upload your CV.";
const CONSENT_MESSAGE = "Please confirm that you agree to the privacy notice.";

type Screen =
  | { kind: "form" }
  | { kind: "success"; result: ApplicationSubmitted }
  | { kind: "closed"; reason: ClosedReason }
  | { kind: "already_applied"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "not_found" };

/** Scroll to and focus the first field (in page order) that has an error. */
function focusFirstError(container: HTMLElement | null, order: string[], errors: AnswerErrors) {
  const firstId = order.find((id) => errors[id]);
  if (!container || !firstId) return;
  const target = Array.from(container.querySelectorAll<HTMLElement>("[data-field-id]")).find(
    (element) => element.dataset.fieldId === firstId,
  );
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
}

function ApplicationForm({ slug, form }: { slug: string; form: PublicApplicationForm }) {
  const contactFields = useMemo(
    () => builtInContactFields(withBuiltInFallback(form.built_in_fields)),
    [form.built_in_fields],
  );
  const allFields = useMemo(() => [...contactFields, ...form.fields], [contactFields, form.fields]);
  const fieldOrder = useMemo(
    () => [
      ...contactFields.map((field) => field.id),
      CV_FIELD_ID,
      ...form.fields.map((field) => field.id),
      CONSENT_KEY,
    ],
    [contactFields, form.fields],
  );
  const cvLabel = withBuiltInFallback(form.built_in_fields).find((field) => field.type === "file")?.label ?? "CV";

  const [values, setValues] = useState<AnswerValues>(() => initialAnswers(allFields));
  const [cv, setCv] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<AnswerErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "form" });
  // Errors snapshot from the latest failed attempt; its first field gets scrolled to and focused.
  const [focusRequest, setFocusRequest] = useState<AnswerErrors | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Focus the first invalid field after the errors have rendered.
  useEffect(() => {
    if (focusRequest) focusFirstError(formRef.current, fieldOrder, focusRequest);
  }, [focusRequest, fieldOrder]);

  const setError = (key: string, message: string | null) =>
    setErrors((current) => {
      if ((current[key] ?? null) === message) return current;
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });

  const onChange = (fieldId: string, value: AnswerValue) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    const field = allFields.find((item) => item.id === fieldId);
    // Before the first submit only clear errors (e.g. from the server); afterwards re-validate live.
    if (field && (attempted || errors[fieldId])) setError(fieldId, attempted ? validateAnswer(field, value) : null);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setAttempted(true);
    setFormError(null);

    const result = validateAnswers(allFields, values);
    const nextErrors: AnswerErrors = result.success ? {} : { ...result.errors };
    if (!cv) nextErrors[CV_FIELD_ID] = CV_REQUIRED_MESSAGE;
    if (!consent) nextErrors[CONSENT_KEY] = CONSENT_MESSAGE;
    setErrors(nextErrors);

    if (!result.success || !cv || !consent) {
      setFormError("Please check the highlighted fields.");
      setFocusRequest(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setProgress(0);
    const controller = new AbortController();
    controllerRef.current = controller;
    publicFormsApi
      .submit(slug, { answers: result.data, consent: true, cv, website }, setProgress, controller.signal)
      .then((submitted) => setScreen({ kind: "success", result: submitted }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = classifySubmitError(error);
        if (failure.kind === "fields") {
          setErrors(failure.errors);
          setFormError(failure.message || "Please check the highlighted fields.");
          setFocusRequest(failure.errors);
        } else if (failure.kind === "consent") {
          const consentErrors = { [CONSENT_KEY]: failure.message };
          setConsent(false);
          setErrors(consentErrors);
          setFocusRequest(consentErrors);
        } else if (failure.kind === "other") {
          setFormError(failure.message);
        } else {
          setScreen(failure);
        }
      })
      .finally(() => {
        submittingRef.current = false;
        setSubmitting(false);
        setProgress(null);
      });
  };

  const fullName = typeof values.full_name === "string" ? values.full_name.trim().replace(/\s+/g, " ") : "";

  if (screen.kind === "success") {
    return (
      <SubmittedScreen jobTitle={form.job.title} companyName={form.company_name} fullName={fullName} />
    );
  }
  if (screen.kind === "closed")
    return (
      <ApplicationsClosedScreen
        jobTitle={form.job.title}
        companyName={form.company_name}
        reason={screen.reason}
        opensOn={form.job.opens_on}
        closesOn={form.job.closes_on}
        opensTime={form.job.opens_time}
        closesTime={form.job.closes_time}
      />
    );
  if (screen.kind === "not_found") return <InvalidLinkScreen />;
  if (screen.kind === "already_applied") {
    return <AlreadyAppliedScreen message={screen.message} jobTitle={form.job.title} companyName={form.company_name} />;
  }
  if (screen.kind === "rate_limited") {
    return (
      <RateLimitedScreen
        message={screen.message}
        companyName={form.company_name}
        onBack={() => setScreen({ kind: "form" })}
      />
    );
  }

  const uploading = progress !== null && progress < 1;

  return (
    <CandidateLayout companyName={form.company_name} subtitle="Job application">
      <div className="animate-slide-up space-y-6">
        <JobSummary form={form} />

        <div className="px-1">
          <h2 className="text-lg font-semibold text-slate-900">{form.title}</h2>
          {form.intro ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{form.intro}</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-500">
            Fields marked <span className="text-rose-600">*</span> are required. No account needed.
          </p>
        </div>

        <form
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          className="space-y-6"
          aria-label={`Application for ${form.job.title}`}
        >
          <ApplicationFormFields
            contactFields={contactFields}
            customFields={form.fields}
            values={values}
            errors={errors}
            onChange={onChange}
            idPrefix={ID_PREFIX}
            disabled={submitting}
            cvSlot={
              <CvDropzone
                id={`${ID_PREFIX}-cv`}
                label={cvLabel}
                file={cv}
                maxUploadMb={form.max_upload_mb}
                error={errors[CV_FIELD_ID]}
                progress={progress}
                disabled={submitting}
                onFileChange={(file) => {
                  setCv(file);
                  setError(CV_FIELD_ID, file || !attempted ? null : CV_REQUIRED_MESSAGE);
                }}
                onReject={(message) => {
                  setCv(null);
                  setError(CV_FIELD_ID, message);
                }}
              />
            }
          />

          {/* Honeypot: hidden from people and assistive tech; only bots fill it in. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] top-auto size-px overflow-hidden"
          >
            <label htmlFor={`${ID_PREFIX}-website`}>Website</label>
            <input
              id={`${ID_PREFIX}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <section aria-labelledby="privacy-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 id="privacy-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ShieldCheck className="size-5 text-emerald-600" aria-hidden />
              Privacy notice
            </h2>
            <div
              className="scrollbar-thin mt-3 max-h-56 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-600"
              tabIndex={0}
              aria-label="Privacy notice text"
            >
              {form.privacy_notice}
            </div>
          </section>

          <div className="space-y-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 sm:p-6">
            <div data-field-id={CONSENT_KEY} className="scroll-mt-24 space-y-2">
              <label htmlFor={`${ID_PREFIX}-consent`} className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  id={`${ID_PREFIX}-consent`}
                  checked={consent}
                  disabled={submitting}
                  aria-invalid={errors[CONSENT_KEY] ? true : undefined}
                  aria-describedby={errors[CONSENT_KEY] ? `${ID_PREFIX}-consent-error` : undefined}
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    if (event.target.checked) setError(CONSENT_KEY, null);
                    else if (attempted) setError(CONSENT_KEY, CONSENT_MESSAGE);
                  }}
                  className="mt-0.5 size-5"
                />
                <span className="text-[15px] leading-relaxed text-slate-800">
                  I have read the privacy notice and agree to {form.company_name} processing my information and CV to
                  assess my application.
                </span>
              </label>
              {errors[CONSENT_KEY] ? (
                <p id={`${ID_PREFIX}-consent-error`} className="pl-8 text-sm font-medium text-rose-600" role="alert">
                  {errors[CONSENT_KEY]}
                </p>
              ) : null}
            </div>

            {formError ? (
              <Alert tone="danger" title="Your application hasn't been sent yet">
                {formError}
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="h-12 w-full text-base" loading={submitting}>
              {submitting
                ? uploading
                  ? `Uploading your CV… ${Math.round((progress ?? 0) * 100)}%`
                  : "Sending your application…"
                : "Submit application"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-slate-500">
              Your application is reviewed by the recruitment team. Automated tools support them but don&apos;t make
              hiring decisions.
            </p>
          </div>
        </form>
      </div>
    </CandidateLayout>
  );
}

/** Public application form (`/apply/:slug`): no HR layout, no login. */
export function PublicApplyPage() {
  const { slug = "" } = useParams();
  const query = usePublicForm(slug || undefined);
  const form = query.data;
  useDocumentTitle(form ? `Apply · ${form.job.title}` : "Apply");

  if (!slug) return <InvalidLinkScreen />;
  if (query.isPending) return <ApplyLoadingScreen />;
  if (query.isError) {
    if (isNotFoundError(query.error)) return <InvalidLinkScreen />;
    return <LoadErrorScreen onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (!query.data.accepting_applications) {
    return (
      <ApplicationsClosedScreen
        jobTitle={query.data.job.title}
        companyName={query.data.company_name}
        reason={toClosedReason(query.data.closed_reason)}
        opensOn={query.data.job.opens_on}
        closesOn={query.data.job.closes_on}
        opensTime={query.data.job.opens_time}
        closesTime={query.data.job.closes_time}
      />
    );
  }
  return <ApplicationForm key={slug} slug={slug} form={query.data} />;
}
