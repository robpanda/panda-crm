/**
 * LoadingSpinner - Panda CRM Loading Component
 * Shows the Panda logo with a spinning ring around it
 */
export default function LoadingSpinner({
  size = 'md',
  message = '',
  fullScreen = false,
  className = ''
}) {
  // Size mappings
  const sizes = {
    sm: { logo: 'w-8 h-8', ring: 'w-12 h-12', border: 'border-2' },
    md: { logo: 'w-12 h-12', ring: 'w-16 h-16', border: 'border-3' },
    lg: { logo: 'w-16 h-16', ring: 'w-24 h-24', border: 'border-4' },
    xl: { logo: 'w-24 h-24', ring: 'w-32 h-32', border: 'border-4' },
  };

  const sizeConfig = sizes[size] || sizes.md;

  const spinner = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative">
        {/* Spinning ring */}
        <div
          className={`absolute inset-0 ${sizeConfig.ring} rounded-full ${sizeConfig.border} border-panda-primary border-t-transparent animate-spin`}
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        />
        {/* Panda logo */}
        <img
          src="/panda-logo-spinner.png"
          alt="Loading..."
          className={`${sizeConfig.logo} object-contain relative z-10`}
        />
      </div>
      {message && (
        <p className="mt-3 text-sm text-gray-500 animate-pulse">{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
}

// Also export a simple inline spinner for buttons etc
export function InlineSpinner({ className = 'w-4 h-4' }) {
  return (
    <div className={`${className} rounded-full border-2 border-panda-primary border-t-transparent animate-spin`} />
  );
}
