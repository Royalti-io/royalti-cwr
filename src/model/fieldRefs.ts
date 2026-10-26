/**
 * Every spec field id the model and the write code name. They live here, not as string literals in
 * `group.ts` and `edit.ts`, so a test can check each against the generated spec for both versions
 * (`test/spec-refs.test.ts`). `record` is the layout key the id belongs to.
 */
export const FIELD_REFS = {
  publisherType: { record: 'SPU', id: 'publisherType' },
  publisherSequenceNumber: { record: 'SPU', id: 'publisherSequenceNumber' },
  grtTransactionCount: { record: 'GRT', id: 'transactionCount' },
  grtRecordCount: { record: 'GRT', id: 'recordCount' },
  trlGroupCount: { record: 'TRL', id: 'groupCount' },
  trlTransactionCount: { record: 'TRL', id: 'transactionCount' },
  trlRecordCount: { record: 'TRL', id: 'recordCount' },
} as const;
