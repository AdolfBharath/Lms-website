const SHEET_NAME = "Join Form";

function doPost(e) {
  const sheet = getOrCreateSheet_();
  const data = JSON.parse(e.postData.contents || "{}");
  const headers = [
    "Submitted At",
    "Full Name",
    "Gender",
    "Email",
    "Phone Number",
    "College Name",
    "Course",
    "Reference ID"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  sheet.appendRow([
    data.submittedAt || new Date().toISOString(),
    data.fullName || "",
    data.gender || "",
    data.email || "",
    data.phone || "",
    data.college || "",
    data.course || "",
    data.referenceId || ""
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}
