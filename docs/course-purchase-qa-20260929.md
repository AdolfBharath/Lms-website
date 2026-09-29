# Course purchase verification

Implemented using the existing Cashfree function, authentication client, registration forms, order tables, and enrollment table.

- Signed-in students open hosted Cashfree directly from Buy Now.
- Visitors register or log in in the existing purchase form, retaining their selected course.
- PAID is checked server-side with exact order, amount, and currency matching.
- Service-only database functions reserve orders and atomically write payment, enrollment, and course assignment.
- Completion uses the stored order's user and course. The browser opens that enrolled course.
- Catalog responses omit protected lessons and quiz answers for unenrolled users.
- Deleted courses are not restored by old payment returns.

## Verification matrix

| Scenario | Evidence |
| --- | --- |
| Logged-in, not enrolled | Browser test: direct Cashfree, no details or checkout panel |
| Logged-in payment success | Browser test: exact purchased course opens |
| Payment failure/cancellation | Browser tests: no enrollment, retry available |
| Already enrolled | Browser test: course opens without payment |
| Visitor registration | Browser test: registration continues to the selected purchase |
| New user payment success/failure | Browser tests cover both results |
| Refresh and logout/login | Browser test: enrollment remains available without another payment |
| Rapid clicks | Browser test: one order request and one gateway launch |
| Duplicate backend requests | Database reservation and completion tests, transaction rolled back |
| Changed amount/currency/order owner | Executable backend tests reject the mismatch |
| Modified course context | Verification endpoint rejects client course/user/price fields |
| Unauthorized content access | Live anonymous and authenticated RLS checks |

## Deployment and limits

Applied migrations 20260929090000 and 20260929090100 and deployed the existing course-purchase Edge Function.
Live database tests created and checked enrollment/payment records inside a transaction that was rolled back.
Read-only audit confirmed the existing paid order for an active course has one matching active enrollment and a verified payment.
The other historical paid order belongs to an intentionally deleted course and cancelled enrollment; it was preserved.

Cashfree is configured for production. No new real-money payment was made. Browser payment tests use a mocked gateway, and a fresh production or sandbox gateway-to-database checkout remains to be performed.

Cashfree hosted checkout follows its [official integration guide](https://www.cashfree.com/devstudio/preview/pg/web/checkout).
