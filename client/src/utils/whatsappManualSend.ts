/**
 * Opens the OS-registered WhatsApp client (desktop app when installed) with a
 * pre-filled chat — not the WhatsApp Business / Cloud API.
 */
export function formatPasswordResetWhatsAppMessage(newPassword: string): string {
    return [
        'Hello — your shop app login password has been reset.',
        '',
        `New password: ${newPassword}`,
        '',
        'Open the app and sign in. You can change this in Account settings after login.',
    ].join('\n');
}

export function openWhatsAppDesktopWithMessage(phoneE164: string, message: string): void {
    const phone = phoneE164.replace(/\D/g, '');
    if (!phone) return;
    const text = encodeURIComponent(message);
    const href = `whatsapp://send?phone=${phone}&text=${text}`;
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/** Fallback when the custom protocol is not registered (often opens the app or browser handler). */
export function buildWhatsAppWebSendUrl(phoneE164: string, message: string): string {
    const phone = phoneE164.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
