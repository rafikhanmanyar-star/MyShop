/**
 * Send SMS via Twilio REST API (no SDK dependency).
 * Use either Messaging Service SID (MG…) or a verified From number (E.164).
 */
export async function sendTwilioSms(opts: {
    accountSid: string;
    authToken: string;
    toE164: string;
    body: string;
    messagingServiceSid?: string | null;
    fromNumber?: string | null;
}): Promise<void> {
    const sid = String(opts.accountSid || '').trim();
    const token = String(opts.authToken || '').trim();
    if (!sid || !token) {
        throw new Error('TWILIO_CREDENTIALS_MISSING');
    }

    const msid = String(opts.messagingServiceSid || '').trim();
    const from = String(opts.fromNumber || '').trim();
    if (!msid && !from) {
        throw new Error('TWILIO_SENDER_NOT_CONFIGURED');
    }

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams();
    params.set('To', opts.toE164);
    params.set('Body', opts.body);
    if (msid) {
        params.set('MessagingServiceSid', msid);
    } else {
        params.set('From', from);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Twilio SMS failed (${res.status}): ${text.slice(0, 500)}`);
    }
}
