# grants-ui-backend

The persistence API used by Grants UI to save, fetch, and migrate grant application state.

## Language

**Grants UI Backend**
The persistence API used by Grants UI to store and retrieve form state.
_Avoid_: GAS, Config API, Redis

**Application state**
The saved answers, identifiers, status, and metadata for a user's grant application.
_Avoid_: Session data when persisted backend state is meant, Form definition

**Form state**
The persisted representation of answers and progress for a grant journey.
_Avoid_: Browser state, Configuration, Payload when the stored state is meant

**Migration**
A backend data change that updates existing persisted application state or indexes.
_Avoid_: Release, Seed script, Feature flag

**Reference number**
The user-facing identifier for a submitted application.
_Avoid_: Grant code, Slug, Session ID

**Client reference**
The reference used when querying or submitting an application to downstream services.
_Avoid_: Reference number when discussing display, Case ID

**CRN**
Customer Reference Number: the Defra ID identifier for an individual user.
_Avoid_: SBI, User ID, Account number

**SBI**
Single Business Identifier: the farm business or organisation represented by the signed-in user.
_Avoid_: CRN, Business name, Holding number

**Lock token**
A token used to coordinate exclusive access to mutable application state.
_Avoid_: Auth token, Session token, CSRF token

**Pact**
The contract-test artifact used to verify API expectations with consumers or providers.
_Avoid_: Unit test, Schema, Mock response
