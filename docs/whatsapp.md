# WhatsApp messages: setup

Talentral sends class reminders, inactivity nudges, cohort announcements, hub messages and phone sign-in codes on WhatsApp to people who choose it, and by SMS to everyone else. WhatsApp is off until the steps below are done; until then everyone keeps getting SMS.

## How people choose WhatsApp

- **On the application form:** "Send me updates on WhatsApp" (unticked by default; shown only when WhatsApp is on).
- **On My learning:** a one-time card, "Get class reminders on WhatsApp?", in English or Hausa.
- **On Account and security:** a switch they can turn on or off at any time.
- **By replying** STOP (or TSAYA, DAINA) to any Talentral WhatsApp message to stop, and START (or FARA) to start again. Each reply is confirmed.

Choices are stored per phone number in `whatsapp_optins`. A "no" is never overridden by a later application tick.

## 1. Meta setup

1. Create a Meta Business account for Talentral Technologies Limited and verify the business.
2. In Meta for Developers, create an app of type **Business** and add the **WhatsApp** product.
3. Add and verify the phone number Talentral will send from (it must not be in use on the WhatsApp app). Set the display name to **Talentral**.
4. Create a **System User** with a permanent access token that has `whatsapp_business_messaging` and `whatsapp_business_management`. This is `WHATSAPP_TOKEN`.
5. Copy the phone number's **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
6. Add a payment method: business-started conversations are charged per conversation by Meta (utility and authentication rates for Nigeria).

## 2. Message templates

Submit these in WhatsApp Manager > Message templates. Names must match (or set `WHATSAPP_TEMPLATE_UPDATE` and `WHATSAPP_TEMPLATE_CODE`).

**`talentral_update`**, category **Utility**, in **English (en)**:

> Message from {{1}}:
>
> {{2}}
>
> Reply STOP to stop WhatsApp messages from Talentral.

Sample values: `{{1}}` = Kirkira Innovation Hub, `{{2}}` = "Web development: Intro to React" starts at 10:00. Join from talentral.ng/learn

Same template in **Hausa (ha)**:

> Saƙo daga {{1}}:
>
> {{2}}
>
> Aika TSAYA don dakatar da saƙonnin WhatsApp daga Talentral.

If WhatsApp Manager does not offer Hausa, submit only English and set `WHATSAPP_LANG_HA=en`: the message itself (`{{2}}`) is still sent in the learner's language.

**`talentral_code`**, category **Authentication**, with a **Copy code** button, in English and (if offered) Hausa. Meta writes the text ("{{1}} is your verification code."). Set the code expiry to 10 minutes.

## 3. Webhook (STOP and START)

1. In the app's WhatsApp > Configuration, set the callback URL to `https://talentral.ng/api/whatsapp/webhook` and the verify token to a long random string. Put the same string in `WHATSAPP_VERIFY_TOKEN`.
2. Subscribe to the **messages** field.
3. Copy the app's **App secret** (App settings > Basic) into `WHATSAPP_APP_SECRET`. Every delivery is checked against it.

## 4. Turn it on

Set in Vercel (Production only, as sensitive variables):

```
WHATSAPP_DRIVER=cloud
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
```

Leave `WHATSAPP_DRIVER` unset in Preview deployments: previews share the production database and must not message real people.

## Notes

- Hub messages count WhatsApp and SMS separately in Messages history.
- Template parameters cannot contain line breaks, so multi-paragraph announcements are joined into one paragraph on WhatsApp. Email keeps the full formatting.
- Sign-in codes go by WhatsApp only when the number chose it; if WhatsApp does not accept the message, the code is sent by SMS instead.
