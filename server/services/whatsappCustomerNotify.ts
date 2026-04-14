/**
 * Optional WhatsApp delivery for customer password resets.
 * Set WHATSAPP_WEBHOOK_URL to POST JSON { to, message } from your provider, or use logs only.
 */

function digitsForWaMe(e164: string): string {
  return e164.replace(/\D/g, '');
}

export async function sendPasswordResetWhatsApp(
  _tenantId: string,
  phoneE164: string,
  newPassword: string
): Promise<{ sent: boolean; waMeUrl?: string }> {
  const message = `Your MyShop password has been reset. New password: ${newPassword}`;
  const waMeUrl = `https://wa.me/${digitsForWaMe(phoneE164)}?text=${encodeURIComponent(message)}`;

  const webhook = process.env.WHATSAPP_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneE164,
          message,
        }),
      });
      if (res.ok) return { sent: true, waMeUrl };
    } catch (e) {
      console.warn('[WhatsApp] webhook failed:', e);
    }
  } else {
    console.log(`[WhatsApp] Password reset message (configure WHATSAPP_WEBHOOK_URL to send): ${message} → ${phoneE164}`);
  }

  return { sent: false, waMeUrl };
}

/** Optional: log / notify shop that a reset was requested (POS polling lists DB rows). */
export async function notifyPasswordResetPending(_tenantId: string, _phoneE164: string): Promise<void> {
  // Reserved for SMS/admin alerts; password_reset_requests row is the source of truth for POS.
}
