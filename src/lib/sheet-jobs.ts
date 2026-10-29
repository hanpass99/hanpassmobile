/** 자동 동기화하는 구글 시트 목록 (서버 잠금 키와 같음). 화면·서버가 함께 사용. */
export const SHEET_JOB_KEYS = ["sheet:received", "sheet:default", "sheet:inter", "sheet:qr", "sheet:friend"] as const;
export type SheetJob = (typeof SHEET_JOB_KEYS)[number];
