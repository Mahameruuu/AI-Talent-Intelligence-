import { Check, Copy, ExternalLink } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, buttonClasses, Input } from "@/components/ui";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/** Compact public-link bar: read-only URL, Copy, Open and an optional extra (e.g. a "⋯" menu). */
export function PublicLinkBar({ url, extra }: { url: string; extra?: ReactNode }) {
  const inputId = useId();
  const { copied, copy } = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);
  const onCopy = async () => {
    const ok = await copy(url);
    setCopyFailed(!ok);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <label htmlFor={inputId} className="sr-only">
          Public link
        </label>
        <Input
          id={inputId}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 basis-full font-mono text-xs sm:basis-auto"
        />
        <Button
          variant={copied ? "secondary" : "primary"}
          leftIcon={copied ? <Check /> : <Copy />}
          onClick={() => void onCopy()}
          aria-live="polite"
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "secondary" })}
        >
          <ExternalLink aria-hidden />
          Open
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {extra}
      </div>
      {copyFailed ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
          Couldn&apos;t copy automatically. Select the link and copy it manually.
        </p>
      ) : null}
    </div>
  );
}
