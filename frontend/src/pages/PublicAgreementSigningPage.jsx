import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Loader2,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Type,
} from 'lucide-react';
import { publicAgreementsApi } from '../services/api';
import {
  formatAgreementStatusLabel,
  getAgreementDocumentUrl,
  getAgreementStatusClasses,
  getSignerRequiredFields,
  normalizeAgreementStatus,
  unwrapApiEnvelope,
} from '../components/contractSigningModalUtils';

const DRAW_MODE = 'DRAW';
const TYPE_MODE = 'TYPE';

function getFieldTypeBadgeClasses(type) {
  const normalized = String(type || '').trim().toUpperCase();
  if (normalized.includes('SIGN')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  if (normalized.includes('INITIAL')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (normalized.includes('DATE')) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function buildTypedSignatureData(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = '600 72px "Brush Script MT", cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, 24, 130);
  return canvas.toDataURL('image/png');
}

function getSessionErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default function PublicAgreementSigningPage() {
  const { token } = useParams();
  const location = useLocation();
  const isHostSigning = location.pathname.startsWith('/host-sign/');
  const signerRole = isHostSigning ? 'AGENT' : 'CUSTOMER';
  const signerLabel = isHostSigning ? 'Agent' : 'Customer';

  const [signatureMode, setSignatureMode] = useState(DRAW_MODE);
  const [typedSignature, setTypedSignature] = useState('');
  const [signatureData, setSignatureData] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [completionData, setCompletionData] = useState(null);

  const canvasRef = useRef(null);

  const signingSessionQuery = useQuery({
    queryKey: ['public-agreement-signing', signerRole, token],
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = isHostSigning
        ? await publicAgreementsApi.getAgreementForHostSigning(token)
        : await publicAgreementsApi.getAgreementForSigning(token);
      return unwrapApiEnvelope(response);
    },
  });

  const signingSession = signingSessionQuery.data || null;
  const normalizedStatus = normalizeAgreementStatus(signingSession?.status);
  const documentUrl = completionData?.signedDocumentUrl || getAgreementDocumentUrl(signingSession);
  const requiredFields = useMemo(
    () => getSignerRequiredFields(signingSession, signerRole),
    [signingSession, signerRole]
  );

  const isAlreadyComplete = isHostSigning
    ? normalizedStatus === 'COMPLETED'
    : normalizedStatus === 'SIGNED' || normalizedStatus === 'PARTIALLY_SIGNED' || normalizedStatus === 'COMPLETED';
  const isLocked = isAlreadyComplete || normalizedStatus === 'VOIDED';
  const hasSubmitted = Boolean(completionData) || isAlreadyComplete;

  useEffect(() => {
    const nextSignerName = isHostSigning
      ? signingSession?.hostSignerName || 'Panda Exteriors'
      : signingSession?.recipientName || 'Customer';

    if (nextSignerName && !signerName) {
      setSignerName(nextSignerName);
      setTypedSignature((current) => current || nextSignerName);
    }
  }, [isHostSigning, signingSession?.hostSignerName, signingSession?.recipientName, signerName]);

  useEffect(() => {
    if (signatureMode !== DRAW_MODE || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.clearRect(0, 0, rect.width, rect.height);
    setSignatureData(null);
  }, [signatureMode]);

  const getCanvasCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    };
  };

  const startDrawing = (event) => {
    if (signatureMode !== DRAW_MODE || isLocked) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoordinates(event);
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const drawSignature = (event) => {
    if (!isDrawing || signatureMode !== DRAW_MODE || isLocked) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoordinates(event);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (!canvasRef.current) return;
    setSignatureData(canvasRef.current.toDataURL('image/png'));
  };

  const clearSignature = () => {
    setSignatureData(null);
    setTypedSignature(signerName || '');
    setSubmitError(null);

    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  };

  const submitSignatureMutation = useMutation({
    mutationFn: async (nextSignatureData) => {
      if (isHostSigning) {
        return publicAgreementsApi.applyHostSignature(token, nextSignatureData, {
          name: signerName || signingSession?.hostSignerName || 'Panda Exteriors',
        });
      }

      return publicAgreementsApi.applySignature(token, nextSignatureData, {
        name: signerName || signingSession?.recipientName || 'Customer',
      });
    },
    onSuccess: (response) => {
      setSubmitError(null);
      setCompletionData(unwrapApiEnvelope(response));
    },
    onError: (error) => {
      setSubmitError(getSessionErrorMessage(error, 'Unable to submit your signature right now.'));
    },
  });

  const handleSubmit = () => {
    if (isLocked) return;

    const nextSignatureData = signatureMode === TYPE_MODE
      ? buildTypedSignatureData(typedSignature || signerName)
      : signatureData || canvasRef.current?.toDataURL('image/png');

    if (!nextSignatureData) {
      setSubmitError('Please draw or type your signature before continuing.');
      return;
    }

    setSubmitError(null);
    submitSignatureMutation.mutate(nextSignatureData);
  };

  if (signingSessionQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center rounded-3xl border border-white/80 bg-white px-8 py-16 text-center shadow-xl">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-panda-primary" />
          <h1 className="text-2xl font-semibold text-slate-900">Loading your agreement</h1>
          <p className="mt-2 text-sm text-slate-600">We’re preparing the PandaSign document for review.</p>
        </div>
      </div>
    );
  }

  if (signingSessionQuery.isError || !signingSession) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white px-8 py-12 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">This signing link is unavailable</h1>
              <p className="mt-2 text-sm text-slate-600">
                {getSessionErrorMessage(signingSessionQuery.error, 'The agreement link may have expired or already been replaced.')}
              </p>
              <p className="mt-4 text-sm text-slate-500">
                Please contact Panda Exteriors if you need a new signing link.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#eff6ff_30%,_#f8fafc_70%)] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  Secure PandaSign
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                  {signingSession.name || 'Agreement Signature'}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  {isHostSigning
                    ? 'Counter-sign the agreement after the customer completes their portion.'
                    : 'Review the agreement and complete your signature below.'}
                </p>
              </div>

              <div className="min-w-[260px] rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getAgreementStatusClasses(normalizedStatus)}`}>
                    {formatAgreementStatusLabel(normalizedStatus)}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{signerLabel}</span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-900">Signer:</span> {signerName || (isHostSigning ? signingSession.hostSignerName : signingSession.recipientName) || signerLabel}</p>
                  {signingSession.expiresAt && (
                    <p><span className="font-medium text-slate-900">Expires:</span> {new Date(signingSession.expiresAt).toLocaleString()}</p>
                  )}
                  {isHostSigning && signingSession.customerName && (
                    <p><span className="font-medium text-slate-900">Customer:</span> {signingSession.customerName}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] sm:px-8">
            <section className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Agreement Preview</p>
                    <p className="mt-1 text-xs text-slate-500">Review the live document before signing.</p>
                  </div>
                  {documentUrl && (
                    <a
                      href={documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Open Document
                    </a>
                  )}
                </div>
                {documentUrl ? (
                  <iframe
                    src={documentUrl}
                    title="Agreement Preview"
                    className="h-[68vh] w-full rounded-2xl border border-slate-200 bg-white"
                  />
                ) : (
                  <div className="flex h-[48vh] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                    The document preview is not available yet. Please contact Panda Exteriors if this persists.
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                    <FileSignature className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {hasSubmitted
                        ? (isHostSigning ? 'Agreement Completed' : 'Signature Received')
                        : `${signerLabel} Signature`}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {hasSubmitted
                        ? (isHostSigning
                          ? 'The agreement has been fully signed.'
                          : 'Your signature has been recorded. Panda Exteriors will complete the remaining signing steps.')
                        : `Complete the required ${signerLabel.toLowerCase()} signature fields below.`}
                    </p>
                  </div>
                </div>

                {hasSubmitted && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold">
                          {isHostSigning ? 'The agreement is complete.' : 'Your signature was submitted successfully.'}
                        </p>
                        <p className="mt-1">
                          {isHostSigning
                            ? 'A completed PDF is available below when the document is ready.'
                            : 'You can close this page. Panda Exteriors will notify the next signer automatically.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {normalizedStatus === 'VOIDED' && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    This agreement has been voided and can no longer be signed.
                  </div>
                )}

                {!hasSubmitted && normalizedStatus !== 'VOIDED' && (
                  <>
                    <div className="mt-5">
                      <label htmlFor="public-signing-name" className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Signer Name
                      </label>
                      <input
                        id="public-signing-name"
                        type="text"
                        value={signerName}
                        onChange={(event) => setSignerName(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/25"
                        placeholder={signerLabel}
                      />
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Required Fields</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {requiredFields.length
                              ? `${requiredFields.length} field${requiredFields.length === 1 ? '' : 's'} will receive this signature.`
                              : 'No signer-specific fields were returned, but a signature is still required.'}
                          </p>
                        </div>
                      </div>

                      {requiredFields.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {requiredFields.map((field) => (
                            <div key={field.id || field.key} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{field.label || field.name || 'Required field'}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    This field will be completed with the signature captured below.
                                  </p>
                                </div>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getFieldTypeBadgeClasses(field.type)}`}>
                                  {String(field.type || 'FIELD').toUpperCase()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Capture Signature</p>
                          <p className="mt-1 text-xs text-slate-500">Draw with your mouse or finger, or type your name.</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearSignature}
                          className="inline-flex items-center rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <RotateCcw className="mr-2 h-3.5 w-3.5" />
                          Clear
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSignatureMode(DRAW_MODE);
                            setSubmitError(null);
                          }}
                          className={`inline-flex items-center justify-center rounded-2xl border px-3 py-3 text-sm font-medium ${
                            signatureMode === DRAW_MODE
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Draw
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSignatureMode(TYPE_MODE);
                            setSubmitError(null);
                          }}
                          className={`inline-flex items-center justify-center rounded-2xl border px-3 py-3 text-sm font-medium ${
                            signatureMode === TYPE_MODE
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Type className="mr-2 h-4 w-4" />
                          Type
                        </button>
                      </div>

                      {signatureMode === DRAW_MODE ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                          <div className="h-52 w-full rounded-2xl bg-white">
                            <canvas
                              ref={canvasRef}
                              className="h-full w-full touch-none rounded-2xl"
                              onMouseDown={startDrawing}
                              onMouseMove={drawSignature}
                              onMouseUp={stopDrawing}
                              onMouseLeave={stopDrawing}
                              onTouchStart={startDrawing}
                              onTouchMove={drawSignature}
                              onTouchEnd={stopDrawing}
                            />
                          </div>
                          <p className="mt-3 text-center text-xs text-slate-500">Draw your signature with touch or mouse.</p>
                        </div>
                      ) : (
                        <div className="mt-4">
                          <label htmlFor="typed-public-signature" className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Typed Signature
                          </label>
                          <input
                            id="typed-public-signature"
                            type="text"
                            value={typedSignature}
                            onChange={(event) => setTypedSignature(event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-lg text-slate-900 shadow-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/25"
                            placeholder={signerName || signerLabel}
                          />
                        </div>
                      )}
                    </div>

                    {(submitError || submitSignatureMutation.isError) && (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {submitError || 'Unable to submit your signature right now.'}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitSignatureMutation.isPending}
                      className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-panda-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-panda-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitSignatureMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting Signature...
                        </>
                      ) : (
                        <>
                          <FileSignature className="mr-2 h-4 w-4" />
                          Submit Signature
                        </>
                      )}
                    </button>
                  </>
                )}

                {documentUrl && hasSubmitted && (
                  <a
                    href={documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Document
                  </a>
                )}
              </section>
            </aside>
          </div>
        </header>
      </div>
    </div>
  );
}
