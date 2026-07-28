# EmailJS admin notification setup

The Student Registration form saves to Supabase first, then sends one
best-effort admin notification through EmailJS.

## EmailJS template

Create one EmailJS template and set its **To Email** field directly to:

```text
dand2903@gmail.com
```

Use these variables in the subject/body:

```text
{{form_type}}
{{applicant_name}}
{{applicant_email}}
{{applicant_phone}}
{{gender}}
{{college_name}}
{{course_interest}}
{{submitted_at}}
```

Suggested subject:

```text
New {{form_type}} - {{applicant_name}}
```

Recommended HTML body:

```html
<div style="margin:0;padding:24px;background:#f4f7f8;font-family:Arial,sans-serif;color:#172126">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
          style="max-width:620px;background:#ffffff;border:1px solid #dfe7e9">
          <tr>
            <td style="padding:24px;background:#073b4c;color:#ffffff">
              <div style="font-size:13px;font-weight:bold;text-transform:uppercase;color:#7ee0d1">
                Jenovate LMS
              </div>
              <div style="margin-top:8px;font-size:24px;font-weight:bold">
                New student registration
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
                A student has submitted the Join Us registration form.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                style="border-collapse:collapse;font-size:14px">
                <tr>
                  <td style="width:34%;padding:11px;background:#f4f7f8;border-bottom:1px solid #dfe7e9;font-weight:bold">Full Name</td>
                  <td style="padding:11px;border-bottom:1px solid #dfe7e9">{{applicant_name}}</td>
                </tr>
                <tr>
                  <td style="padding:11px;background:#f4f7f8;border-bottom:1px solid #dfe7e9;font-weight:bold">Email</td>
                  <td style="padding:11px;border-bottom:1px solid #dfe7e9">
                    <a href="mailto:{{applicant_email}}" style="color:#087f8c">{{applicant_email}}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:11px;background:#f4f7f8;border-bottom:1px solid #dfe7e9;font-weight:bold">Phone</td>
                  <td style="padding:11px;border-bottom:1px solid #dfe7e9">{{applicant_phone}}</td>
                </tr>
                <tr>
                  <td style="padding:11px;background:#f4f7f8;border-bottom:1px solid #dfe7e9;font-weight:bold">Gender</td>
                  <td style="padding:11px;border-bottom:1px solid #dfe7e9">{{gender}}</td>
                </tr>
                <tr>
                  <td style="padding:11px;background:#f4f7f8;border-bottom:1px solid #dfe7e9;font-weight:bold">College</td>
                  <td style="padding:11px;border-bottom:1px solid #dfe7e9">{{college_name}}</td>
                </tr>
                <tr>
                  <td style="padding:11px;background:#f4f7f8;font-weight:bold">Course Interest</td>
                  <td style="padding:11px">{{course_interest}}</td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;color:#64747b">
                Submitted at {{submitted_at}}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#edf3f4;font-size:12px;color:#64747b">
              This notification was generated automatically by Jenovate LMS.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
```

Copy the EmailJS Public Key, Service ID, and Template ID into
`form-engine/emailjs-config.js`. These identifiers are designed for browser
use; do not put an EmailJS private key in this file.
