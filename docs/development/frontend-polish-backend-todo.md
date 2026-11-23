# Frontend polish: backend notes

Backend changes the frontend polish work found it needs. The polish developer adds entries here and does not make the changes. See [frontend-polish.md](frontend-polish.md).

Entry format:

```text
### <short title>

- Screen: <route and design image>
- Missing: <what the screen cannot do or show today>
- Why: <what the person using the screen gets from it>
- Expected API: <method and path, request fields, response fields>
- Workaround in the UI: <what the screen does until then>
```

## Entries

### Email and password sign-up with a business step

- Screen: /sign-up, design file "Dakly AI Commerce v4", screens Sign up step 1 and step 2.
- Missing: Sign-up needs a mobile number verified by a code. The design asks for email, password and "How did you hear about us?" first, then name, business name, phone, optional website, and whether the business offers products, services or both. `signUpSchema` has no source field and no business kind, and email is optional.
- Why: The design lets a shop owner start with an email and a password and finish the rest later.
- Expected API: `POST /auth/sign-up` accepting `email`, `password`, `source` (one of Facebook, Facebook group, YouTube, ChatGPT, Google Search, Phone call, Other), optional `sourceOther`, then a second call for `name`, `businessName`, `phone`, `websiteUrl` and `offering` (`products`, `services`, `both`). The design shows no mobile code at sign-up. The product owner chose to keep the SMS code, so the account would still be created only after the phone is verified. Changing that needs a decision record, because feature 01, D20 and D48 describe phone-first sign-up today.
- Workaround in the UI: The page follows the design: email, password and source, then name, business name, phone, website and offering, then the SMS code. Only the name, phone, email and password reach the API today. The source, business name, website and offering are collected and not stored, and the setup screen asks for the business name again. Invites keep the older single form.

### Continue with Facebook

- Screen: /sign-in and /sign-up, design file "Dakly AI Commerce v4".
- Missing: Only Google sign-in exists. The design shows a Facebook button on both screens.
- Why: Many Dakly shops already manage their Page and inbox through Facebook.
- Expected API: `POST /auth/facebook` with the Facebook access token, returning the same response as `POST /auth/google`.
- Workaround in the UI: The Facebook button is left out.

### Email-only password reset

- Screen: /forgot-password, design file "Dakly AI Commerce v4".
- Missing: The reset screen asks for a mobile number or an email. The design asks for the email on the account only and emails the code.
- Why: One field and one channel, with copy that matches the design.
- Expected API: None new if email-only is the product decision. Confirm that phone-only accounts can still reset by SMS before the screen drops the mobile option.
- Workaround in the UI: The page has the design's four screens (email, code, new password, password updated). The email field still accepts a mobile number so phone-only accounts can reset. The code and the new password go to the API together, so a wrong code shows after the password step, with a link back to the code step.
