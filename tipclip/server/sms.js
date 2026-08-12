// SMS abstraction. Mock provider logs to the console; Twilio adapter is used
// automatically when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set.
'use strict';

const mockSms = {
  name: 'mock',
  async send(to, body) {
    if (!to) return;
    console.log(`  📱 SMS → ${to}: ${body}`);
  },
};

const twilioSms = {
  name: 'twilio',
  async send(to, body) {
    if (!to) return;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) console.error(`Twilio error ${res.status}: ${await res.text()}`);
  },
};

function getSms() {
  return process.env.TWILIO_ACCOUNT_SID ? twilioSms : mockSms;
}

module.exports = { getSms };
