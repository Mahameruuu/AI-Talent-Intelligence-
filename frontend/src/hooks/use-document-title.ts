import { useEffect } from "react";

const PRODUCT = "XORCA Talent Intelligence";

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${PRODUCT}` : PRODUCT;
  }, [title]);
}
