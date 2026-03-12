/**
 * Shared noise filtering utilities for Botmem connectors.
 *
 * Conservative by design: better to keep questionable content than filter real memories.
 * All functions return true if the content IS noise (should be skipped).
 */

/** Common automated/noreply sender patterns */
const AUTOMATED_SENDER_PATTERNS = [
  /\bnoreply@/i,
  /\bno-reply@/i,
  /\bnotifications?@/i,
  /\bmailer-daemon@/i,
  /\bpostmaster@/i,
  /\bdo-not-reply@/i,
  /\bdoNotReply@/i,
  /\bautomatic-reply@/i,
  /\bbounce[s]?@/i,
];

/**
 * Check if text looks like an OTP/verification code message.
 * Matches patterns like "Your code is 123456" or "123456 is your verification code".
 */
export function isOtp(text: string): boolean {
  if (!text) return false;
  // "Your code is 123456" / "verification code: 123456"
  const codeFirst = /\b(?:code|otp|verify|verification|confirm(?:ation)?|pin)\b.*\b\d{4,8}\b/i;
  // "123456 is your verification code"
  const codeAfter = /\b\d{4,8}\b.*\b(?:code|otp|verify|verification|confirm(?:ation)?|pin)\b/i;
  return codeFirst.test(text) || codeAfter.test(text);
}

/**
 * Check if the sender appears to be an automated system.
 * Looks at `from`, `sender`, and `senderEmail` fields in metadata.
 */
export function isAutomatedSender(metadata: Record<string, unknown>): boolean {
  const candidates = [metadata.from, metadata.sender, metadata.senderEmail].filter(
    (v): v is string => typeof v === 'string',
  );

  for (const addr of candidates) {
    for (const pattern of AUTOMATED_SENDER_PATTERNS) {
      if (pattern.test(addr)) return true;
    }
  }
  return false;
}

/**
 * Check if an email is marketing/promotional content.
 * Returns true for newsletters and promos, but NOT for purchase receipts or shipping notices.
 */
export function isMarketingEmail(text: string, metadata: Record<string, unknown>): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();

  // Must contain "unsubscribe" to be considered marketing
  if (!lowerText.includes('unsubscribe')) return false;

  // Exclude purchase/shipping receipts -- these are valuable memories
  const receiptPatterns = [
    /\b(?:order|purchase)\s*(?:#|number|confirmation)/i,
    /\bshipping\s*(?:confirm|notification|update)/i,
    /\btracking\s*(?:number|#|info)/i,
    /\breceipt\b/i,
    /\binvoice\b/i,
    /\bdelivery\s*(?:confirm|notification|update)/i,
    /\byour\s+order\b/i,
  ];

  for (const pattern of receiptPatterns) {
    if (pattern.test(text)) return false;
  }

  // Check for Gmail promotional/social labels
  const labels = metadata.labels;
  if (Array.isArray(labels)) {
    if (labels.includes('CATEGORY_PROMOTIONS') || labels.includes('CATEGORY_SOCIAL')) {
      return true;
    }
  }

  return true; // has "unsubscribe" and is not a receipt
}

/**
 * Check if text looks like an automated SMS notification (not a human conversation).
 * Catches 2FA messages missed by isOtp, carrier alerts, delivery notifications, etc.
 */
export function isNotificationSms(text: string): boolean {
  if (!text || text.length > 500) return false;

  const lower = text.toLowerCase().trim();

  // Very short non-conversational messages (standalone "Delivered", "Read", "Sent")
  if (/^(delivered|read|sent|stopped|unsubscribed)\.?$/i.test(lower)) return true;

  // 2FA/auth patterns not caught by isOtp (no bare digit sequence)
  const authPatterns = [
    /\bsign[- ]?in\s+(code|link|attempt)/i,
    /\bsecurity\s+(code|alert|notice)/i,
    /\blogin\s+(code|attempt|alert)/i,
    /\b(two|2)[- ]?(factor|step|fa)\b/i,
    /\bpassword\s+(?:was\s+)?(?:reset|changed|updated)/i,
    /\baccount\s+(verification|security|alert)/i,
  ];
  for (const p of authPatterns) {
    if (p.test(text)) return true;
  }

  // Carrier/system SMS
  const carrierPatterns = [
    /\byou(?:'ve|'ve| have)\s+used\s+\d+%?\s+(?:of\s+)?(?:your\s+)?data/i,
    /\bdata\s+(?:usage|limit|cap|allowance)\b/i,
    /\bminutes?\s+(?:remaining|left|used)\b/i,
    /\bplan\s+(?:renewal|expired|expir)/i,
    /\bpay\s+(?:your\s+)?bill\b/i,
    /\bauto[- ]?pay\b.*\b(?:charged|processed|scheduled)\b/i,
  ];
  for (const p of carrierPatterns) {
    if (p.test(text)) return true;
  }

  // App transactional notifications via SMS
  const appNotifPatterns = [
    /\byour\s+(?:uber|lyft|grab)\s+(?:ride|driver|trip)\b/i,
    /\byour\s+(?:doordash|ubereats|grubhub|deliveroo)\s+order\b/i,
    /\byour\s+(?:package|parcel|shipment)\s+(?:has been|is|was)\s+(?:delivered|shipped|dispatched)/i,
    /\byour\s+(?:appointment|reservation|booking)\s+(?:is\s+|has\s+been\s+)?(?:confirmed|cancelled|rescheduled)/i,
    /\breply\s+(?:STOP|YES|NO|HELP)\s+to\b/i,
    /\btext\s+STOP\s+to\s+(?:cancel|opt[- ]?out|unsubscribe)/i,
    /\bmsg(?:&data)?\s*rates\s*(?:may\s+)?apply/i,
  ];
  for (const p of appNotifPatterns) {
    if (p.test(text)) return true;
  }

  return false;
}

/**
 * Main noise detection function. Returns true if the content should be filtered out.
 * Conservative: only filters clearly automated/noise content.
 */
export function isNoise(text: string, metadata: Record<string, unknown>): boolean {
  if (isOtp(text)) return true;
  if (isAutomatedSender(metadata)) return true;
  if (isNotificationSms(text)) return true;
  if (isMarketingEmail(text, metadata)) return true;
  return false;
}

/** Describes why a message was filtered */
export type NoiseReason =
  | 'otp'
  | 'automated_sender'
  | 'notification_sms'
  | 'marketing'
  | 'protocol'
  | 'bot'
  | 'system'
  | 'receipt'
  | 'reaction'
  | 'status_broadcast'
  | 'ephemeral'
  | 'empty'
  | 'promo_label'
  | 'list_unsubscribe';

/**
 * Like isNoise, but returns the reason for filtering (or null if not noise).
 * Useful for debug logging.
 */
export function detectNoiseReason(
  text: string,
  metadata: Record<string, unknown>,
): NoiseReason | null {
  if (isOtp(text)) return 'otp';
  if (isAutomatedSender(metadata)) return 'automated_sender';
  if (isNotificationSms(text)) return 'notification_sms';
  if (isMarketingEmail(text, metadata)) return 'marketing';
  return null;
}
