
"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ProcessedFile = {
  name: string;
  url: string;
  size: number;
  pages: number;
  totalFormFields: number;
  signatureRelatedFields: number;
  signatureStatus: "fields-found" | "no-fields-found";
  detectedMarkers: string[];
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProcessedFile | null>(null);

  const clearResult = useCallback(() => {
    setResult((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.url);
      }

      return null;
    });
  }, []);

  const processFile = useCallback(
    async (file?: File) => {
      setError("");
      clearResult();

      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please select a PDF file.");
        return;
      }

      if (file.size === 0) {
        setError("This file is empty. Choose another PDF.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("The file exceeds the 50 MB limit.");
        return;
      }

      setProcessing(true);

      try {
        const bytes = await file.arrayBuffer();

        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
          throw new Error("This file does not have a valid PDF header.");
        }

        // Scan the raw PDF bytes for common signature-related markers.
        // This is a heuristic scan, not cryptographic validation.
        const rawPdf = new TextDecoder("latin1").decode(bytes);

        const signatureMarkers = [
          {
            label: "ByteRange marker",
            found: /\/ByteRange\s*\[/.test(rawPdf),
          },
          {
            label: "Signature dictionary marker",
            found: /\/Type\s*\/Sig\b/.test(rawPdf),
          },
          {
            label: "Signature field marker",
            found: /\/FT\s*\/Sig\b/.test(rawPdf),
          },
        ];

        const detectedMarkers = signatureMarkers.filter(
          (marker) => marker.found
        );

        const pdf = await PDFDocument.load(bytes, {
          updateMetadata: false,
        });

        const pages = pdf.getPageCount();

        if (pages === 0) {
          throw new Error("This PDF does not contain any pages.");
        }

        const form = pdf.getForm();
        const fields = form.getFields();

        const signatureRelatedFields = fields.filter((field) => {
          const name = field.constructor.name.toLowerCase();
          return name.includes("signature");
        });

        const fieldReport = {
          totalFormFields: fields.length,
          signatureRelatedFields: signatureRelatedFields.length,
          detectedMarkers: detectedMarkers.map((marker) => marker.label),
        };

        // Re-save the supported PDF. This does not guarantee signature removal.
        const output = await pdf.save({
          useObjectStreams: true,
        });

        console.info("PDF field inspection:", fieldReport);

        const safeBuffer = new ArrayBuffer(output.byteLength);
        new Uint8Array(safeBuffer).set(output);

        const blob = new Blob([safeBuffer], {
          type: "application/pdf",
        });

        const url = URL.createObjectURL(blob);

        setResult({
          name: file.name.replace(/\.pdf$/i, "") + "-processed.pdf",
          url,
          size: blob.size,
          pages,
          totalFormFields: fieldReport.totalFormFields,
          signatureRelatedFields: fieldReport.signatureRelatedFields,
          signatureStatus:
            fieldReport.signatureRelatedFields > 0
              ? "fields-found"
              : "no-fields-found",
          detectedMarkers: fieldReport.detectedMarkers,
        });
      } catch {
        setError(
          "We couldn't process this PDF. It may be encrypted, malformed, or use unsupported PDF features. Your original file has not been changed."
        );
      } finally {
        setProcessing(false);

        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [clearResult]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white">
              P
            </span>

            <span className="text-lg font-bold tracking-tight">
              PDF Cleanroom
            </span>
          </Link>

          <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:inline-flex">
            100% browser-based
          </span>
        </div>
      </header>

      {/* Main content */}
      <section className="mx-auto max-w-4xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Private PDF processing
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">
            Make your PDFs
            <span className="block text-emerald-600">
              easier to work with.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Re-save supported PDFs into a fresh document structure for
            downstream tools and workflows. Your files stay on your device.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl">
          {/* Upload area */}
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();

              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null
                )
              ) {
                setDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void processFile(event.dataTransfer.files[0]);
            }}
            className={`rounded-3xl border-2 border-dashed p-7 text-center transition sm:p-12 ${dragging
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-300 bg-white hover:border-emerald-400"
              }`}
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
              📄
            </div>

            <h2 className="mt-5 text-xl font-semibold">
              Drop your PDF here
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Or choose a file from your device
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                void processFile(event.target.files?.[0]);
              }}
            />

            <button
              type="button"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing ? "Processing PDF..." : "Choose PDF file"}
            </button>

            <p className="mt-4 text-xs text-slate-400">
              PDF files only · Maximum size 50 MB
            </p>
          </div>

          {/* Processing status */}
          {processing && (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800"
            >
              Reading and re-saving your PDF in the browser...
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
            >
              <p className="font-semibold">Unable to process PDF</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* Processing result */}
          {result && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
              {/* FIX: Keep the success row separate from the inspection panel. */}
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700">
                  ✓
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">
                    PDF re-saved successfully
                  </h3>

                  <p className="mt-1 break-all text-sm text-slate-600">
                    {result.name}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {result.pages} pages · {formatSize(result.size)}
                  </p>
                </div>
              </div>

              {/* Full-width signature inspection panel */}
              <div className="mt-5 rounded-xl border border-slate-200 p-4 sm:p-5">
                <p className="text-sm font-semibold text-slate-900">
                  Signature inspection
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {result.signatureStatus === "fields-found"
                    ? "Signature-related form fields were detected."
                    : "No signature-related form fields were detected."}
                </p>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This is a limited form-field inspection, not cryptographic
                  signature validation. Signature removal has not been
                  performed, and this report cannot establish that a PDF is
                  unsigned.
                </p>

                {/* Raw marker report */}
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    PDF signature markers
                  </p>

                  {result.detectedMarkers.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {result.detectedMarkers.map((marker) => (
                        <li
                          key={marker}
                          className="flex items-start gap-2 text-sm text-slate-700"
                        >
                          <span
                            aria-hidden="true"
                            className="font-semibold text-emerald-700"
                          >
                            ✓
                          </span>
                          <span>{marker} detected</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      No recognized signature markers found in the raw PDF
                      scan.
                    </p>
                  )}

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Marker detection is not proof of a valid digital signature.
                    Signature removal has not been performed.
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-700">
                  <span aria-hidden="true">!</span>
                  <span>Signature removal: not performed</span>
                </div>
              </div>

              {/* Form-field counts */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Form fields found</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {result.totalFormFields}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">
                    Signature-related fields
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {result.signatureRelatedFields}
                  </p>
                </div>
              </div>

              {/* Important limitation */}
              <p className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                Re-saving a PDF does not guarantee removal of digital
                signatures, encryption, or all signature-related data. Verify
                the output before using it in an AI pipeline.
              </p>

              {/* Actions */}
              <a
                href={result.url}
                download={result.name}
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Download processed PDF ↓
              </a>

              <button
                type="button"
                onClick={clearResult}
                className="mt-3 w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                Remove result
              </button>
            </div>
          )}

          {/* Privacy notice */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-100 p-4">
            <span className="text-lg" aria-hidden="true">
              🔒
            </span>

            <div>
              <p className="text-sm font-semibold text-slate-800">
                Your files stay on your device
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600">
                This tool processes files locally. It does not upload your PDF
                to an application server.
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {[
            {
              number: "01",
              title: "Select a PDF",
              text: "Choose a supported PDF up to 50 MB.",
            },
            {
              number: "02",
              title: "Process locally",
              text: "The browser reads and re-saves the document.",
            },
            {
              number: "03",
              title: "Download",
              text: "Save your processed copy without changing the original.",
            },
          ].map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm font-bold text-emerald-600">
                {step.number}
              </p>

              <h3 className="mt-3 font-semibold">{step.title}</h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 PDF Cleanroom</p>
          <p>Local processing. No account required.</p>
        </div>
      </footer>
    </main>
  );
}
