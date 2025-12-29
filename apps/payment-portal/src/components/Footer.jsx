import React from 'react';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secured by Stripe</span>
          </div>

          <div className="text-sm text-gray-500">
            © {currentYear} Panda Exteriors. All rights reserved.
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href="tel:+12408016665"
              className="text-gray-500 hover:text-panda-primary transition-colors"
            >
              (240) 801-6665
            </a>
            <a
              href="https://pandaexteriors.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-panda-primary transition-colors"
            >
              pandaexteriors.com
            </a>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center gap-6">
          <img src="https://cdn.brandfolder.io/KGT2DTA4/at/8vbr58k2cb5xsr83fx9qgb9/Visa_Brandmark_Blue_RGB_2021.svg" alt="Visa" className="h-6 opacity-60" />
          <img src="https://cdn.brandfolder.io/KGT2DTA4/at/gxvpk3r8qb5h7cp7t9m3gq/mc_symbol.svg" alt="Mastercard" className="h-6 opacity-60" />
          <img src="https://cdn.brandfolder.io/KGT2DTA4/at/p4s4vr59jf5g5xqgp5k8k3/amex.svg" alt="American Express" className="h-6 opacity-60" />
          <img src="https://cdn.brandfolder.io/KGT2DTA4/at/6qs7nhmx4xvp9rwj7vq3hg/discover.svg" alt="Discover" className="h-6 opacity-60" />
        </div>
      </div>
    </footer>
  );
}

export default Footer;
