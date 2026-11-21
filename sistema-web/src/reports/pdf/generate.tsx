/*
 * Entry point of the PDF reports. This module (and the documents it imports, which pull in react-pdf) must
 * only be reached through `import("./pdf/generate")`, never a static import.
 */
import type { Storage } from "@/storage/types";
import { notebookModel, portfolioModel, progressModel } from "./models";
import { NotebookDocument } from "./Notebook";
import { loadPhotos, type PdfPhoto } from "./photos";
import { PortfolioDocument } from "./Portfolio";
import { ProgressReportDocument } from "./ProgressReport";
import { renderPdf } from "./render";

export type PdfResult = { blob: Blob; skippedPhotos: number };
type WithStorage = { storage: Pick<Storage, "readFile"> };

/** Loads the photos of each record in turn (only the records that will be printed). */
async function photosOf(storage: WithStorage["storage"], records: { photos: string[] }[]) {
  const photos: PdfPhoto[][] = [];
  let skipped = 0;
  for (const r of records) {
    const loaded = await loadPhotos(storage, r.photos);
    photos.push(loaded.photos);
    skipped += loaded.skipped;
  }
  return { photos, skipped };
}

export async function portfolioPdf(p: Parameters<typeof portfolioModel>[0] & WithStorage): Promise<PdfResult> {
  const model = portfolioModel(p);
  const { photos, skipped } = await photosOf(p.storage, model.entries);
  return { blob: await renderPdf(<PortfolioDocument model={model} photos={photos} />), skippedPhotos: skipped };
}

export async function progressPdf(p: Parameters<typeof progressModel>[0]): Promise<PdfResult> {
  const model = progressModel(p);
  return { blob: await renderPdf(<ProgressReportDocument model={model} />), skippedPhotos: 0 };
}

export async function notebookPdf(p: Parameters<typeof notebookModel>[0] & WithStorage): Promise<PdfResult> {
  const model = notebookModel(p);
  const { photos, skipped } = await photosOf(p.storage, model.pages);
  return { blob: await renderPdf(<NotebookDocument model={model} photos={photos} />), skippedPhotos: skipped };
}
