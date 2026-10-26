// Generated. Do not edit.
// 38 tables, 2444 rows.
import type { LookupTable } from './types';
import { AGREEMENT_ROLE_CODE, isAgreementRoleCode } from './agreementRoleCode';
import { AGREEMENT_TYPE, isAgreementType } from './agreementType';
import { BLTVR, isBltvr } from './bltvr';
import { COMPOSITE_TYPE, isCompositeType } from './compositeType';
import { CWR_REVISION_NUMBER, isCwrRevisionNumber } from './cwrRevisionNumber';
import { CWR_WORK_TYPE, isCwrWorkType } from './cwrWorkType';
import { DIALECT_CODE, isDialectCode } from './dialectCode';
import { EXCERPT_TYPE, isExcerptType } from './excerptType';
import { IDENTIFIER_TYPE, isIdentifierType } from './identifierType';
import { IDENTIFIER_VALIDITY, isIdentifierValidity } from './identifierValidity';
import { INCLUSION_EXCLUSION_INDICATOR, isInclusionExclusionIndicator } from './inclusionExclusionIndicator';
import { INSTRUMENT, isInstrument } from './instrument';
import { INTENDED_PURPOSE, isIntendedPurpose } from './intendedPurpose';
import { ISRC_VALIDITY, isIsrcValidity } from './isrcValidity';
import { LANGUAGE_CODE, isLanguageCode } from './languageCode';
import { LYRIC_ADAPTATION, isLyricAdaptation } from './lyricAdaptation';
import { MEDIA_TYPE, isMediaType } from './mediaType';
import { MESSAGE_LEVEL, isMessageLevel } from './messageLevel';
import { MESSAGE_TYPE, isMessageType } from './messageType';
import { MUSIC_ARRANGEMENT, isMusicArrangement } from './musicArrangement';
import { MUSICAL_WORK_DISTRIBUTION_CATEGORY, isMusicalWorkDistributionCategory } from './musicalWorkDistributionCategory';
import { PUBLISHER_TYPE, isPublisherType } from './publisherType';
import { RECORD_TYPE, isRecordType } from './recordType';
import { RECORDING_TECHNIQUE, isRecordingTechnique } from './recordingTechnique';
import { SOCIETY_CODE, isSocietyCode } from './societyCode';
import { SPECIAL_AGREEMENT_INDICATOR, isSpecialAgreementIndicator } from './specialAgreementIndicator';
import { STANDARD_INSTRUMENTATION, isStandardInstrumentation } from './standardInstrumentation';
import { SUBJECT_CODE, isSubjectCode } from './subjectCode';
import { TEXT_MUSIC_RELATIONSHIP, isTextMusicRelationship } from './textMusicRelationship';
import { TIS, isTis } from './tis';
import { TITLE_TYPE, isTitleType } from './titleType';
import { TRANSACTION_STATUS, isTransactionStatus } from './transactionStatus';
import { TRANSACTION_TYPE, isTransactionType } from './transactionType';
import { TRANSMITTER_CODE, isTransmitterCode } from './transmitterCode';
import { TYPE_OF_RIGHT, isTypeOfRight } from './typeOfRight';
import { USA_LICENSE_INDICATOR, isUsaLicenseIndicator } from './usaLicenseIndicator';
import { VERSION_TYPE, isVersionType } from './versionType';
import { WRITER_DESIGNATION, isWriterDesignation } from './writerDesignation';

export type { LookupRow, LookupScope, LookupTable } from './types';
export { AGREEMENT_ROLE_CODE, isAgreementRoleCode } from './agreementRoleCode';
export { AGREEMENT_TYPE, isAgreementType } from './agreementType';
export { BLTVR, isBltvr } from './bltvr';
export { COMPOSITE_TYPE, isCompositeType } from './compositeType';
export { CWR_REVISION_NUMBER, isCwrRevisionNumber } from './cwrRevisionNumber';
export { CWR_WORK_TYPE, isCwrWorkType } from './cwrWorkType';
export { DIALECT_CODE, isDialectCode } from './dialectCode';
export { EXCERPT_TYPE, isExcerptType } from './excerptType';
export { IDENTIFIER_TYPE, isIdentifierType } from './identifierType';
export { IDENTIFIER_VALIDITY, isIdentifierValidity } from './identifierValidity';
export { INCLUSION_EXCLUSION_INDICATOR, isInclusionExclusionIndicator } from './inclusionExclusionIndicator';
export { INSTRUMENT, isInstrument } from './instrument';
export { INTENDED_PURPOSE, isIntendedPurpose } from './intendedPurpose';
export { ISRC_VALIDITY, isIsrcValidity } from './isrcValidity';
export { LANGUAGE_CODE, isLanguageCode } from './languageCode';
export { LYRIC_ADAPTATION, isLyricAdaptation } from './lyricAdaptation';
export { MEDIA_TYPE, isMediaType } from './mediaType';
export { MESSAGE_LEVEL, isMessageLevel } from './messageLevel';
export { MESSAGE_TYPE, isMessageType } from './messageType';
export { MUSIC_ARRANGEMENT, isMusicArrangement } from './musicArrangement';
export { MUSICAL_WORK_DISTRIBUTION_CATEGORY, isMusicalWorkDistributionCategory } from './musicalWorkDistributionCategory';
export { PUBLISHER_TYPE, isPublisherType } from './publisherType';
export { RECORD_TYPE, isRecordType } from './recordType';
export { RECORDING_TECHNIQUE, isRecordingTechnique } from './recordingTechnique';
export { SOCIETY_CODE, isSocietyCode } from './societyCode';
export { SPECIAL_AGREEMENT_INDICATOR, isSpecialAgreementIndicator } from './specialAgreementIndicator';
export { STANDARD_INSTRUMENTATION, isStandardInstrumentation } from './standardInstrumentation';
export { SUBJECT_CODE, isSubjectCode } from './subjectCode';
export { TEXT_MUSIC_RELATIONSHIP, isTextMusicRelationship } from './textMusicRelationship';
export { TIS, isTis } from './tis';
export { TITLE_TYPE, isTitleType } from './titleType';
export { TRANSACTION_STATUS, isTransactionStatus } from './transactionStatus';
export { TRANSACTION_TYPE, isTransactionType } from './transactionType';
export { TRANSMITTER_CODE, isTransmitterCode } from './transmitterCode';
export { TYPE_OF_RIGHT, isTypeOfRight } from './typeOfRight';
export { USA_LICENSE_INDICATOR, isUsaLicenseIndicator } from './usaLicenseIndicator';
export { VERSION_TYPE, isVersionType } from './versionType';
export { WRITER_DESIGNATION, isWriterDesignation } from './writerDesignation';

/** Every generated table by id, the id being the `lookup` value of a field row in the spec. */
export const LOOKUPS = {
  agreementRoleCode: { id: "agreementRoleCode", rows: AGREEMENT_ROLE_CODE, has: isAgreementRoleCode },
  agreementType: { id: "agreementType", rows: AGREEMENT_TYPE, has: isAgreementType },
  bltvr: { id: "bltvr", rows: BLTVR, has: isBltvr },
  compositeType: { id: "compositeType", rows: COMPOSITE_TYPE, has: isCompositeType },
  cwrRevisionNumber: { id: "cwrRevisionNumber", rows: CWR_REVISION_NUMBER, has: isCwrRevisionNumber },
  cwrWorkType: { id: "cwrWorkType", rows: CWR_WORK_TYPE, has: isCwrWorkType },
  dialectCode: { id: "dialectCode", rows: DIALECT_CODE, has: isDialectCode },
  excerptType: { id: "excerptType", rows: EXCERPT_TYPE, has: isExcerptType },
  identifierType: { id: "identifierType", rows: IDENTIFIER_TYPE, has: isIdentifierType },
  identifierValidity: { id: "identifierValidity", rows: IDENTIFIER_VALIDITY, has: isIdentifierValidity },
  inclusionExclusionIndicator: { id: "inclusionExclusionIndicator", rows: INCLUSION_EXCLUSION_INDICATOR, has: isInclusionExclusionIndicator },
  instrument: { id: "instrument", rows: INSTRUMENT, has: isInstrument },
  intendedPurpose: { id: "intendedPurpose", rows: INTENDED_PURPOSE, has: isIntendedPurpose },
  isrcValidity: { id: "isrcValidity", rows: ISRC_VALIDITY, has: isIsrcValidity },
  languageCode: { id: "languageCode", rows: LANGUAGE_CODE, has: isLanguageCode },
  lyricAdaptation: { id: "lyricAdaptation", rows: LYRIC_ADAPTATION, has: isLyricAdaptation },
  mediaType: { id: "mediaType", rows: MEDIA_TYPE, has: isMediaType },
  messageLevel: { id: "messageLevel", rows: MESSAGE_LEVEL, has: isMessageLevel },
  messageType: { id: "messageType", rows: MESSAGE_TYPE, has: isMessageType },
  musicArrangement: { id: "musicArrangement", rows: MUSIC_ARRANGEMENT, has: isMusicArrangement },
  musicalWorkDistributionCategory: { id: "musicalWorkDistributionCategory", rows: MUSICAL_WORK_DISTRIBUTION_CATEGORY, has: isMusicalWorkDistributionCategory },
  publisherType: { id: "publisherType", rows: PUBLISHER_TYPE, has: isPublisherType },
  recordType: { id: "recordType", rows: RECORD_TYPE, has: isRecordType },
  recordingTechnique: { id: "recordingTechnique", rows: RECORDING_TECHNIQUE, has: isRecordingTechnique },
  societyCode: { id: "societyCode", rows: SOCIETY_CODE, has: isSocietyCode },
  specialAgreementIndicator: { id: "specialAgreementIndicator", rows: SPECIAL_AGREEMENT_INDICATOR, has: isSpecialAgreementIndicator },
  standardInstrumentation: { id: "standardInstrumentation", rows: STANDARD_INSTRUMENTATION, has: isStandardInstrumentation },
  subjectCode: { id: "subjectCode", rows: SUBJECT_CODE, has: isSubjectCode },
  textMusicRelationship: { id: "textMusicRelationship", rows: TEXT_MUSIC_RELATIONSHIP, has: isTextMusicRelationship },
  tis: { id: "tis", rows: TIS, has: isTis },
  titleType: { id: "titleType", rows: TITLE_TYPE, has: isTitleType },
  transactionStatus: { id: "transactionStatus", rows: TRANSACTION_STATUS, has: isTransactionStatus },
  transactionType: { id: "transactionType", rows: TRANSACTION_TYPE, has: isTransactionType },
  transmitterCode: { id: "transmitterCode", rows: TRANSMITTER_CODE, has: isTransmitterCode },
  typeOfRight: { id: "typeOfRight", rows: TYPE_OF_RIGHT, has: isTypeOfRight },
  usaLicenseIndicator: { id: "usaLicenseIndicator", rows: USA_LICENSE_INDICATOR, has: isUsaLicenseIndicator },
  versionType: { id: "versionType", rows: VERSION_TYPE, has: isVersionType },
  writerDesignation: { id: "writerDesignation", rows: WRITER_DESIGNATION, has: isWriterDesignation },
} as const satisfies Record<string, LookupTable>;

export type LookupId = keyof typeof LOOKUPS;

/** The ids of the lookup tables, in alphabetical order. */
export const LOOKUP_IDS: readonly LookupId[] = ["agreementRoleCode","agreementType","bltvr","compositeType","cwrRevisionNumber","cwrWorkType","dialectCode","excerptType","identifierType","identifierValidity","inclusionExclusionIndicator","instrument","intendedPurpose","isrcValidity","languageCode","lyricAdaptation","mediaType","messageLevel","messageType","musicArrangement","musicalWorkDistributionCategory","publisherType","recordType","recordingTechnique","societyCode","specialAgreementIndicator","standardInstrumentation","subjectCode","textMusicRelationship","tis","titleType","transactionStatus","transactionType","transmitterCode","typeOfRight","usaLicenseIndicator","versionType","writerDesignation"] as const;

/**
 * Membership test by table id. Returns undefined when the id is not a generated table (for example an id the spec names
 * but gives no table), so a caller can tell "not in the table" from "no table".
 */
export function lookupHas(id: string, code: string): boolean | undefined {
  const table = (LOOKUPS as Readonly<Record<string, LookupTable>>)[id];
  return table === undefined ? undefined : table.has(code);
}
