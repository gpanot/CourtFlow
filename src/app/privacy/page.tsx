export const metadata = {
  title: "Privacy Policy — CourtPay",
  description: "Privacy policy for the CourtPay mobile application.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-neutral-200">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-neutral-500 mb-10">Last updated: April 2026</p>

      <section className="space-y-6 text-sm leading-relaxed text-neutral-300">
        <div>
          <h2 className="text-base font-semibold text-white mb-2">1. What We Collect</h2>
          <p>CourtPay collects the following information to operate the service:</p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Full name and phone number (provided by venue staff when registering a player)</li>
            <li>Facial image data (captured at check-in and used solely for player identification)</li>
            <li>Payment records (amount, method, date, and reference number)</li>
            <li>Subscription and session usage data</li>
            <li>Device push notification tokens (for payment alerts)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">2. How We Use Your Data</h2>
          <ul className="list-disc ml-5 space-y-1">
            <li>To identify players during court check-in via face recognition</li>
            <li>To track subscription balances and session usage</li>
            <li>To process and confirm payments</li>
            <li>To send push notifications when payments are confirmed</li>
            <li>To provide venue owners with usage analytics</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">3. Data Sharing</h2>
          <p>
            We do not sell, rent, or share personal data with third parties for marketing purposes.
            Data is shared only with the venue (club) where you are registered, and with
            AWS Rekognition (used solely for face matching — images are not stored by AWS beyond
            the recognition call).
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">4. Data Storage & Security</h2>
          <p>
            All data is stored on secured servers hosted on Railway (PostgreSQL). Facial images
            are stored in AWS S3 with restricted access. We use HTTPS for all data in transit.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">5. Data Retention</h2>
          <p>
            Player data is retained for as long as the venue account is active. You may request
            deletion of your data by contacting your venue manager or emailing us directly.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">6. Your Rights</h2>
          <p>
            You have the right to access, correct, or delete your personal data. To exercise
            these rights, contact your venue or email us at the address below.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">7. Children</h2>
          <p>
            CourtPay is intended for use by adults (18+) and venue staff. We do not knowingly
            collect data from children under 13.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-2">8. Contact</h2>
          <p>
            For privacy questions or data requests, contact:{" "}
            <a href="mailto:support@courtpay.app" className="text-emerald-400 underline">
              support@courtpay.app
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
