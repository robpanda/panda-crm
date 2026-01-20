import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { agreementsApi } from '../services/api';
import {
  X,
  Pen,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  User,
  RotateCcw,
  Download,
} from 'lucide-react';

/**
 * HostSigningModal - Modal for in-person counter-signing by agent/representative
 * Based on Adobe Sign "Host Signing" workflow from Scribe documentation
 *
 * Flow:
 * 1. Agent initiates host signing for a customer-signed agreement
 * 2. Agent sees the document and customer's signature
 * 3. Agent draws their signature on the canvas
 * 4. Agent submits signature to complete the agreement
 */
export default function HostSigningModal({
  isOpen,
  onClose,
  agreement,
  currentUser,
  onSuccess,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hostSigningSession, setHostSigningSession] = useState(null);
  const [signatureData, setSignatureData] = useState(null);
  const [step, setStep] = useState(1); // 1: Review, 2: Sign, 3: Complete
  const [error, setError] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSignatureData(null);
      setError(null);
      setHostSigningSession(null);
      clearCanvas();
    }
  }, [isOpen]);

  // Initialize canvas when step 2 is shown
  useEffect(() => {
    if (step === 2 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [step]);

  // Initiate host signing session
  const initHostSigningMutation = useMutation({
    mutationFn: async () => {
      const response = await agreementsApi.initiateHostSigning(agreement.id, {
        name: currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
        email: currentUser?.email,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setHostSigningSession(data);
      setStep(2);
      setError(null);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to initiate host signing');
    },
  });

  // Apply host signature
  const applySignatureMutation = useMutation({
    mutationFn: async () => {
      if (!hostSigningSession?.hostSigningToken || !signatureData) {
        throw new Error('Missing signing session or signature data');
      }
      const response = await agreementsApi.applyHostSignature(
        hostSigningSession.hostSigningToken,
        signatureData,
        {
          name: currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
          email: currentUser?.email,
        }
      );
      return response.data;
    },
    onSuccess: (data) => {
      setStep(3);
      if (onSuccess) onSuccess(data);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to apply signature');
    },
  });

  // Canvas drawing functions
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Save signature data
    const canvas = canvasRef.current;
    setSignatureData(canvas.toDataURL('image/png'));
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureData(null);
  };

  const handleInitiateHostSigning = () => {
    setError(null);
    initHostSigningMutation.mutate();
  };

  const handleSubmitSignature = () => {
    if (!signatureData) {
      setError('Please draw your signature above');
      return;
    }
    applySignatureMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Pen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Host Signing</h2>
                <p className="text-sm text-gray-500">
                  {step === 1 && 'Review agreement and proceed to sign'}
                  {step === 2 && 'Draw your signature'}
                  {step === 3 && 'Agreement completed'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            {/* Step 1: Review */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Agreement Info */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start">
                    <FileText className="w-6 h-6 text-panda-primary mr-3 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{agreement?.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Agreement #{agreement?.agreementNumber || agreement?.id}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Customer Signed
                    </span>
                  </div>
                </div>

                {/* Customer Signature Info */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900">Customer has signed</p>
                      <p className="text-sm text-blue-700 mt-1">
                        <strong>{agreement?.recipientName}</strong> signed this agreement on{' '}
                        {agreement?.signedAt
                          ? new Date(agreement.signedAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Host Signer Info */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">You are signing as:</h3>
                  <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-panda-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-panda-primary" />
                    </div>
                    <div className="ml-4">
                      <p className="font-medium text-gray-900">
                        {currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'Agent'}
                      </p>
                      <p className="text-sm text-gray-500">{currentUser?.email}</p>
                    </div>
                  </div>
                </div>

                {/* View Document Link */}
                {(agreement?.signedDocumentUrl || agreement?.documentUrl) && (
                  <a
                    href={agreement.signedDocumentUrl || agreement.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full p-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View Document Before Signing
                  </a>
                )}

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Sign */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Signature Canvas */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Draw Your Signature</h3>
                    <button
                      onClick={clearCanvas}
                      className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Clear
                    </button>
                  </div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-1 bg-white">
                    <canvas
                      ref={canvasRef}
                      width={550}
                      height={200}
                      className="w-full cursor-crosshair touch-none"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Use your mouse or touch to draw your signature
                  </p>
                </div>

                {/* Signer Info Summary */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">
                    Signing as <strong>{currentUser?.name || currentUser?.firstName}</strong> ({currentUser?.email})
                  </p>
                </div>

                {/* Legal Agreement */}
                <p className="text-xs text-gray-500 text-center">
                  By clicking "Submit Signature", you agree that your electronic signature is legally binding
                  and has the same validity as a handwritten signature under the ESIGN Act and UETA.
                </p>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Complete */}
            {step === 3 && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Agreement Completed!
                </h3>
                <p className="text-gray-500 mb-6">
                  All parties have signed. The fully executed document has been sent to all parties.
                </p>

                {/* Download Link */}
                {agreement?.signedDocumentUrl && (
                  <a
                    href={agreement.signedDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 mb-4"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Completed Document
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
            {step === 1 && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInitiateHostSigning}
                  disabled={initHostSigningMutation.isPending}
                  className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {initHostSigningMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Pen className="w-4 h-4 mr-2" />
                      Proceed to Sign
                    </>
                  )}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitSignature}
                  disabled={!signatureData || applySignatureMutation.isPending}
                  className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {applySignatureMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Submit Signature
                    </>
                  )}
                </button>
              </>
            )}

            {step === 3 && (
              <button
                onClick={onClose}
                className="ml-auto px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
