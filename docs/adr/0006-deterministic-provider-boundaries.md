# Server-only provider contracts and deterministic staging

Storage, transcoding, delivery and DRM use separate server-only contracts so the platform can be demonstrated before real providers are selected. Deterministic adapters are permitted only in development, tests and Railway staging; production Dashboard startup is blocked until real adapters pass verification. Fake upload storage is process-local, so staging runs one continuously awake replica and in-progress uploads do not survive restarts; this is not production storage or evidence of real DRM.
