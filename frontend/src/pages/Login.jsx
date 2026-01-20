import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, LogIn, AlertCircle, Link2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, completeNewPassword, user } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);

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
  const oauthClientId = searchParams.get('client_id');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const email = normalizeEmail(emailOrUsername);

      if (challenge === 'NEW_PASSWORD_REQUIRED') {
        const result = await completeNewPassword(email, newPassword, challenge.session);
        if (isOAuthFlow && result) {
          completeOAuthFlow(result);
        } else {
          navigate(from, { replace: true });
        }
      } else {
        const result = await login(email, password);

        if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
          setChallenge(result);
          setPassword('');
        } else {
          // If this is an OAuth flow, redirect back to RingCentral
          if (isOAuthFlow && result) {
            completeOAuthFlow(result);
          } else {
            navigate(from, { replace: true });
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent mb-4">
            Bamboo 2.0
          </h1>
          {isOAuthFlow ? (
            <div className="mt-2">
              <div className="flex items-center justify-center space-x-2 text-blue-400 mb-2">
                <Link2 className="w-5 h-5" />
                <span className="font-medium">Connect to RingCentral</span>
              </div>
              <p className="text-gray-400 text-sm">Sign in to link your Panda CRM account</p>
            </div>
          ) : (
            <p className="text-gray-400 mt-2">Sign in to your account</p>
          )}
        </div>

        {/* Login form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="flex items-center space-x-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {challenge !== 'NEW_PASSWORD_REQUIRED' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email or Username
                  </label>
                  <input
                    type="text"
                    value={emailOrUsername}
                    onChange={(e) => setEmailOrUsername(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="panda or panda@pandaexteriors.com"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none pr-10"
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
              </>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  You need to set a new password to continue.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none pr-10"
                    placeholder="••••••••"
                    required
                    minLength={8}
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
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-blue-700 to-orange-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>{challenge === 'NEW_PASSWORD_REQUIRED' ? 'Set Password' : 'Sign In'}</span>
                </>
              )}
            </button>
          </form>

          {challenge !== 'NEW_PASSWORD_REQUIRED' && (
            <div className="mt-4 text-center">
              <button className="text-sm text-blue-600 hover:underline">
                Forgot your password?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
