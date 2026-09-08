import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Shield, ArrowLeft, Lock, EyeOff, Server, Mail } from 'lucide-react';
import { updatePageMetadata, resetToDefaultMetadata } from '../utils/seo';

export const PrivacyPolicyPage: React.FC = () => {
  useEffect(() => {
    updatePageMetadata({
      walkthroughTitle: 'Privacy Policy',
      description: 'Privacy Policy for NAVIGATE - An interactive guide portal by Rotaract South Asia MDIO.'
    });
    return () => {
      resetToDefaultMetadata();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 md:px-12 py-3.5 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0c3c60] to-[#1e4e79] p-0.5 shadow-md shadow-blue-900/15 group-hover:scale-105 transition-transform flex items-center justify-center text-white">
              <Compass className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg sm:text-xl text-[#0c3c60]">NAVIGATE</span>
              <img src="/rsamdio.webp" alt="RSA MDIO" className="h-5 sm:h-6 w-auto object-contain opacity-90" />
            </div>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Guides</span>
          </Link>
        </div>
      </header>

      {/* Content Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14 space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-[#0c3c60] text-xs font-bold font-mono">
            <Shield className="w-3.5 h-3.5" />
            <span>Official Policy Document</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Privacy Policy</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Last Updated: August 2026 | Rotaract South Asia Multi-District Information Organization (RSA MDIO)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-2xs space-y-8 text-sm text-slate-700 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#0c3c60]" />
              <span>1. Overview & Zero-Database Public Architecture</span>
            </h2>
            <p>
              NAVIGATE (accessible at <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#0c3c60] font-mono text-xs">navigate.rsamdio.org</code>) is an interactive guide and walkthrough portal built for Rotaract Members, Club Leaders, and District Rotaract Representatives across South Asia.
            </p>
            <p>
              We are committed to user privacy. Public walkthrough viewers enjoy a <strong>high-performance, privacy-conscious architecture</strong>. When you browse the catalog or play an interactive guide, your actions are delivered statically via edge CDN without invasive profiling, data harvesting, or advertising tracking.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#0c3c60]" />
              <span>2. Guide Authoring & DOM Privacy Redaction</span>
            </h2>
            <p>
              Authorized RSA MDIO creators record walkthroughs of web applications (such as My Rotary or district portals) using our specialized browser extension.
            </p>
            <p>
              Our recording pipeline includes automated privacy redactions and manual element masking tools to ensure sensitive personal details, passwords, and private identifiers are blurred or removed prior to publication.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-[#0c3c60]" />
              <span>3. Creator Authentication & Account Data</span>
            </h2>
            <p>
              For authorized content authors accessing the Creator Studio:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Authentication is handled securely via Firebase Google Sign-In.</li>
              <li>We store your name, email address, profile avatar, and role (Creator / Super Admin) in order to manage permissions and author credits.</li>
              <li>Creator credentials are never shared with third parties or used for marketing purposes.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">4. Third-Party Infrastructure & Analytics</h2>
            <p>
              NAVIGATE relies on standard, privacy-compliant edge infrastructure:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li><strong>Cloudflare R2 CDN</strong>: Serves static guide manifests and assets globally with high speed and zero-tracking.</li>
              <li><strong>Google Firebase</strong>: Manages backend creator authentication and security policies.</li>
              <li><strong>Google Analytics 4</strong>: Collects anonymous, aggregated usage metrics (e.g. guide page views and session counts) to help Rotaract South Asia MDIO improve educational content. No personally identifiable information or marketing profiling is collected.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">5. Cookies & Local Storage</h2>
            <p>
              NAVIGATE does not use advertising or marketing trackers. Local storage is used for functional preferences (such as remembering search queries and audio mute state). Privacy-compliant analytics cookies may be utilized by Google Analytics for aggregate platform metrics.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 pt-4 border-t border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#0c3c60]" />
              <span>6. Contact Us</span>
            </h2>
            <p>
              If you have any questions or feedback regarding this Privacy Policy or data privacy in NAVIGATE, please contact the Rotaract South Asia MDIO team:
            </p>
            <p className="font-semibold text-slate-800">
              Rotaract South Asia MDIO Secretariat<br />
              Website: <a href="https://rsamdio.org" target="_blank" rel="noreferrer" className="text-[#0c3c60] hover:underline">rsamdio.org</a><br />
              Email: <a href="mailto:contact@rsamdio.org" className="text-[#0c3c60] hover:underline">contact@rsamdio.org</a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-4 sm:px-6 text-xs text-slate-600">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Rotaract South Asia MDIO. All rights reserved.</p>
          <div className="flex items-center gap-4 font-semibold">
            <Link to="/" className="hover:text-slate-900">Home</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-slate-900">Terms of Service</Link>
            <span>•</span>
            <a href="https://rsamdio.org" target="_blank" rel="noreferrer" className="hover:text-slate-900">About RSA MDIO</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
