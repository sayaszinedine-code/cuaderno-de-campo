import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/** Renders a react-pdf `<Document>`; the renderer is fetched on demand so it never weighs on other pages. */
export async function renderPdf(element: ReactElement<DocumentProps>): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(element).toBlob();
  return blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
}
