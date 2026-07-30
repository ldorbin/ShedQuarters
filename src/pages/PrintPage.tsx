import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DocumentSheet } from "../components/DocumentSheet";
import { BackIcon, DownloadIcon, PrintIcon } from "../components/Icons";
import { documents as documentsApi } from "../lib/api";
import { useSettings } from "../lib/settings";
import { formatReg } from "../../shared/format";
import type { GarageDocument } from "../../shared/types";
import { KIND_LABELS, SLUG_TO_KIND } from "../../shared/types";

export function PrintPage() {
  const { kindSlug = "", id = "" } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const sheetRef = useRef<HTMLDivElement>(null);

  const [document, setDocument] = useState<GarageDocument | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    documentsApi
      .get(id)
      .then((result) => {
        if (!cancelled) setDocument(result);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (document) {
      window.document.title = `${document.number} · ShedQuarters`;
    }
    return () => {
      window.document.title = "ShedQuarters — Garage Invoicing";
    };
  }, [document]);

  const downloadPdf = useCallback(async () => {
    const node = sheetRef.current;
    if (!node || !document || generating) return;

    setGenerating(true);
    try {
      // Loaded on demand — these two libraries are far larger than the app.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.95);

      pdf.addImage(image, "JPEG", 0, 0, pageWidth, imageHeight);

      // Long job cards spill onto further pages; shift the same image up.
      let remaining = imageHeight - pageHeight;
      let offset = -pageHeight;
      while (remaining > 1) {
        pdf.addPage();
        pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight);
        remaining -= pageHeight;
        offset -= pageHeight;
      }

      const reg = formatReg(document.vehicleReg).replace(/\s/g, "");
      pdf.save([document.number, reg].filter(Boolean).join("-") + ".pdf");
    } catch {
      setError("Couldn't build the PDF. Use Print and choose 'Save as PDF' instead.");
    } finally {
      setGenerating(false);
    }
  }, [document, generating]);

  const kind = SLUG_TO_KIND[kindSlug];
  const backTo = kind ? `/${kindSlug}/${id}` : "/";

  return (
    <div className="print-screen">
      <div className="print-toolbar no-print">
        <button type="button" className="btn btn-sm" onClick={() => navigate(backTo)}>
          <BackIcon />
          Back to editor
        </button>

        <span style={{ fontWeight: 600 }}>
          {document
            ? `${KIND_LABELS[document.kind]?.singular ?? ""} ${document.number}`
            : "Loading…"}
        </span>

        <span className="spacer" />

        <button
          type="button"
          className="btn btn-sm"
          onClick={downloadPdf}
          disabled={!document || generating}
        >
          <DownloadIcon />
          {generating ? "Building PDF…" : "Download PDF"}
        </button>

        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => window.print()}
          disabled={!document}
        >
          <PrintIcon />
          Print
        </button>
      </div>

      {error && (
        <div className="sheet-wrap no-print">
          <div className="alert alert-error" style={{ maxWidth: 620, width: "100%" }}>
            {error}
          </div>
        </div>
      )}

      {document && settings ? (
        <div className="sheet-wrap">
          <DocumentSheet ref={sheetRef} document={document} settings={settings} />
        </div>
      ) : (
        !error && (
          <div className="loading-block">
            <span className="spinner" />
            Loading document…
          </div>
        )
      )}
    </div>
  );
}
