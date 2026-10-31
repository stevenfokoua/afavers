import { Helmet } from 'react-helmet-async';

export const DisclaimerPage = () => {
  return (
    <>
    <Helmet>
      <title>Disclaimer & Privacy Notice – afavers</title>
      <meta name="description" content="Disclaimer and privacy notice for afavers — a free job application tracker for Germany. Learn how we handle your data and where job listings come from." />
      <link rel="canonical" href="https://afavers.online/disclaimer" />
    </Helmet>
    <div className="min-h-screen bg-canvas">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <a href="/" className="text-accent text-sm font-medium hover:underline">← Back to afavers</a>
          <h1 className="mt-6 text-3xl font-semibold text-ink">Disclaimer &amp; Privacy Notice</h1>
          <p className="mt-2 text-sm text-muted">Last updated: March 2026</p>
        </div>

        <div className="space-y-10 text-ink leading-relaxed">

          {/* Service */}
          <section>
            <h2 className="text-xl font-semibold text-ink mb-3">1. About afavers</h2>
            <p>
              afavers is a personal job-tracking tool that helps users in Germany organise their job search.
              Job listings displayed on the platform are sourced from the{' '}
              <strong>Bundesagentur für Arbeit</strong> public API and from third-party job boards via the
              afavers browser extension. afavers is not a recruitment agency and does not facilitate or
              guarantee employment.
            </p>
          </section>

          {/* Third-party content */}
          <section>
            <h2 className="text-xl font-semibold text-ink mb-3">2. Third-Party Job Listings</h2>
            <p>
              Job listings shown on afavers are retrieved from external sources including the Bundesagentur
              für Arbeit, Adzuna, StepStone, LinkedIn, Indeed, XING, and other job boards. afavers does not own,
              verify, or endorse any of these listings. We are not responsible for the accuracy,
              completeness, or availability of third-party job content.
            </p>
            <p className="mt-3">
              Use of the afavers browser extension to save job listings from third-party websites is
              subject to the terms of service of those websites. Users are responsible for ensuring their
              use of the extension complies with the applicable terms of each site they visit.
            </p>
          </section>

          {/* No liability */}
          <section>
            <h2 className="text-xl font-semibold text-ink mb-3">3. Limitation of Liability</h2>
            <p>
              afavers is provided "as is" without warranties of any kind. We are not liable for any direct
              or indirect damages arising from the use of this platform, including missed job opportunities,
              inaccurate job data, or service interruptions. Job listings may expire, be modified, or be
              removed without notice.
            </p>
          </section>

          {/* Data & Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-ink mb-3">4. Data &amp; Privacy (GDPR)</h2>
            <p>
              afavers collects the minimum data necessary to provide the service:
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-muted">
              <li><strong>Account data:</strong> email address and encrypted password, used solely for authentication.</li>
              <li><strong>Job tracking data:</strong> job titles, companies, and statuses you save — stored privately in your account and not shared with third parties.</li>
              <li><strong>Local storage:</strong> your login session token is stored in your browser's local storage to keep you signed in. This is not a cookie and does not track you across websites.</li>
              <li><strong>No analytics cookies:</strong> afavers does not use advertising or third-party tracking cookies.</li>
            </ul>
            <p className="mt-3">
              You may request deletion of your account and all associated data at any time by contacting us.
              Under GDPR (Regulation 2016/679) you have the right to access, correct, or erase your personal
              data.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-ink mb-3">5. Contact</h2>
            <p>
              For privacy requests or questions about this notice, please contact us at{' '}
              <a href="mailto:contact@afavers.online" className="text-accent hover:underline">contact@afavers.online</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
    </>
  );
};
