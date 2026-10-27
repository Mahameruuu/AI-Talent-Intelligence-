import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/utils/cn";

export interface InvitationLinkFieldProps {
  url: string;
  label?: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  size?: "sm" | "md";
  autoFocus?: boolean;
  /** Accessible name of the copy button, e.g. "Copy link for Ayu". */
  copyLabel?: string;
}

/** Read-only invitation URL with a copy button. */
export function InvitationLinkField({
  url,
  label = "Interview link",
  hideLabel = false,
  size = "md",
  autoFocus = false,
  copyLabel,
}: InvitationLinkFieldProps) {
  const { copied, copy } = useCopyToClipboard();
  const inputId = useId();
  const [copyFailed, setCopyFailed] = useState(false);

  const onCopy = async () => {
    const ok = await copy(url);
    setCopyFailed(!ok);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className={cn("font-mono text-xs", size === "sm" && "h-8")}
          data-autofocus={autoFocus || undefined}
        />
        <Button
          variant={copied ? "secondary" : size === "sm" ? "outline" : "primary"}
          size={size === "sm" ? "sm" : "md"}
          leftIcon={copied ? <Check /> : <Copy />}
          onClick={() => void onCopy()}
          aria-label={copied ? "Copied" : copyLabel}
          aria-live="polite"
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {copyFailed ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          Couldn&apos;t copy automatically. Select the link and copy it manually.
        </p>
      ) : null}
    </div>
  );
}
