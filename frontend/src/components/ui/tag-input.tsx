import { X } from "lucide-react";
import { useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/utils/cn";

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  suggestions?: string[];
  maxTags?: number;
  tone?: "neutral" | "primary" | "danger";
  "aria-describedby"?: string;
}

const chipTone = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  primary: "border-indigo-200 bg-indigo-50 text-indigo-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

/** Free-text tag input: Enter or comma adds, Backspace on empty removes the last tag, paste splits on commas. */
export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  id,
  disabled,
  invalid,
  suggestions,
  maxTags,
  tone = "primary",
  "aria-describedby": describedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  const addTags = (raw: string[]) => {
    const next = [...value];
    for (const item of raw) {
      const tag = item.trim().replace(/\s+/g, " ");
      if (!tag) continue;
      if (next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
      if (maxTags !== undefined && next.length >= maxTags) break;
      next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
  };

  const commitDraft = () => {
    if (!draft.trim()) return;
    addTags([draft]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (draft.trim()) {
        event.preventDefault();
        commitDraft();
      }
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (/[,;\n]/.test(text)) {
      event.preventDefault();
      addTags(text.split(/[,;\n]/));
    }
  };

  const remove = (tag: string) => onChange(value.filter((item) => item !== tag));

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-xs transition-colors",
        "focus-within:border-indigo-500 focus-within:ring-3 focus-within:ring-indigo-500/15",
        invalid && "border-rose-400",
        disabled && "bg-slate-50",
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className={cn("inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 text-xs font-medium", chipTone[tone])}
        >
          {tag}
          {!disabled ? (
            <button
              type="button"
              onClick={() => remove(tag)}
              className="rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={commitDraft}
        list={suggestions?.length ? listId : undefined}
        placeholder={value.length === 0 ? placeholder : ""}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-6 min-w-[8rem] flex-1 border-0 bg-transparent px-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions
            .filter((item) => !value.some((tag) => tag.toLowerCase() === item.toLowerCase()))
            .map((item) => (
              <option key={item} value={item} />
            ))}
        </datalist>
      ) : null}
    </div>
  );
}
