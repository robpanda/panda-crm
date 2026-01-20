import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { Eye, EyeOff, LogIn, AlertCircle, Link2, Mail, ArrowLeft, KeyRound, CheckCircle } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, completeNewPassword, user } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);

  // View modes: 'login' | 'forgot' | 'reset' | 'newPassword'
  const [mode, setMode] = useState('login');

  // Convert username to email if needed
  const normalizeEmail = (input) => {
    const trimmed = input.trim().toLowerCase();
    // If it already contains @, use as-is
    if (trimmed.includes('@')) {
      return trimmed;
    }
    // Otherwise, append the default domain
    return `${trimmed}@pandaexteriors.com`;
  };

  const from = location.state?.from?.pathname || '/';

  // OAuth params for RingCentral App Connect
  const oauthRedirectUri = searchParams.get('redirect_uri');
  const oauthState = searchParams.get('state');
  const isOAuthFlow = !!(oauthRedirectUri && oauthState);

  // If already logged in and this is an OAuth flow, complete it immediately
  useEffect(() => {
    if (user && isOAuthFlow) {
      completeOAuthFlow(user);
    }
  }, [user, isOAuthFlow]);

  // Complete OAuth by redirecting back to RingCentral with auth code
  const completeOAuthFlow = (userData) => {
    // Create an authorization code containing user info (base64 encoded)
    const authCode = btoa(JSON.stringify({
      userId: userData.id || userData.sub,
      email: userData.email,
      firstName: userData.firstName || userData.given_name,
      lastName: userData.lastName || userData.family_name,
      timestamp: Date.now()
    }));

    // Redirect back to RingCentral with the code
    const redirectUrl = new URL(oauthRedirectUri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', oauthState);

    console.log('Completing OAuth flow, redirecting to:', redirectUrl.toString());
    window.location.href = redirectUrl.toString();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const email = normalizeEmail(emailOrUsername);
      const result = await login(email, password);

      if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
        setChallenge(result);
        setMode('newPassword');
        setPassword('');
      } else {
        // If this is an OAuth flow, redirect back to RingCentral
        if (isOAuthFlow && result) {
          completeOAuthFlow(result);
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const email = normalizeEmail(emailOrUsername);
      const result = await completeNewPassword(email, newPassword, challenge.session);
      if (isOAuthFlow && result) {
        completeOAuthFlow(result);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const email = normalizeEmail(emailOrUsername);
      await authApi.forgotPassword(email);
      setSuccess('A verification code has been sent to your email');
      setMode('reset');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const email = normalizeEmail(emailOrUsername);
      await authApi.resetPassword(email, resetCode, newPassword);
      setSuccess('Password reset successfully! You can now sign in.');
      setMode('login');
      setNewPassword('');
      setConfirmPassword('');
      setResetCode('');
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setMode('login');
    setError('');
    setSuccess('');
    setNewPassword('');
    setConfirmPassword('');
    setResetCode('');
    setChallenge(null);
  };

  const getTitle = () => {
    switch (mode) {
      case 'forgot':
        return 'Reset Password';
      case 'reset':
        return 'Enter Verification Code';
      case 'newPassword':
        return 'Set New Password';
      default:
        return 'Sign in to your account';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <img
            src="/panda-logo.svg"
            alt="Panda Exteriors"
            className="h-32 w-auto mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-lime-400 via-teal-400 to-orange-400 bg-clip-text text-transparent mb-2">
            Bamboo 2.0
          </h1>
          {isOAuthFlow ? (
            <div className="mt-2">
              <div className="flex items-center justify-center space-x-2 text-teal-400 mb-2">
                <Link2 className="w-5 h-5" />
                <span className="font-medium">Connect to RingCentral</span>
              </div>
              <p className="text-gray-400 text-sm">Sign in to link your Panda CRM account</p>
            </div>
          ) : (
            <p className="text-gray-400 mt-1">{getTitle()}</p>
          )}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Back button for non-login modes */}
          {mode !== 'login' && (
            <button
              type="button"
              onClick={goBackToLogin}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to sign in
            </button>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center space-x-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span className="text-sm text-green-600">{success}</span>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email or Username
                </label>
                <input
                  type="email"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  placeholder="panda or panda@pandaexteriors.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck="false"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter your username or full email address
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-teal-600 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setSuccess('');
                  }}
                  className="text-sm text-teal-600 hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form - Request Code */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <p className="text-sm text-gray-600 mb-4">
                Enter your email address and we'll send you a verification code to reset your password.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  placeholder="you@pandaexteriors.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck="false"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-teal-600 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    <span>Send Verification Code</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Reset Password Form - Enter Code and New Password */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <p className="text-sm text-gray-600 mb-4">
                Enter the verification code sent to your email and choose a new password.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-center text-lg tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none pr-10"
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  At least 8 characters with uppercase, lowercase, and numbers
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-teal-600 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-5 h-5" />
                    <span>Reset Password</span>
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setResetCode('');
                  }}
                  className="text-sm text-teal-600 hover:underline"
                >
                  Didn't receive the code? Send again
                </button>
              </div>
            </form>
          )}

          {/* First-time Login - Set New Password */}
          {mode === 'newPassword' && (
            <form onSubmit={handleNewPassword} className="space-y-5">
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-teal-800">
                  <strong>Welcome!</strong> This is your first time logging in. Please set a new password to secure your account.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none pr-10"
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  At least 8 characters with uppercase, lowercase, and numbers
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-teal-600 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-5 h-5" />
                    <span>Set Password & Continue</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
