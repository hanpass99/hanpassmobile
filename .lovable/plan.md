# QR 개통 신청자 메뉴 복구 (10월 데이터만)

## 무엇이 돌아오나
- 고객 관리에 **QR 개통 신청자** 탭이 예전처럼 다시 생깁니다(목록, 상태, 담당자, 엑셀 등 다른 탭과 동일).
- QR 구글 시트 자동 가져오기도 다시 켭니다. 단, **신청일 10월 1일 이후 건만** 가져옵니다.
- 예전에 지운 296건은 시트에서 다시 읽어오므로 10월 건만 새로 들어옵니다. 지울 때 함께 사라진 담당자 배정·메모·통화 기록은 되돌릴 수 없습니다(모두 미배정·미처리로 시작).

## 순서
1. 10월 15일에 지운 QR 탭 화면·시트 가져오기 기능을 예전 기록에서 그대로 되살립니다.
2. 10월 이전 접수는 건너뛰도록 날짜 제한을 넣고, 시스템에서도 10월 이전 QR 건이 저장되지 않게 막습니다.
3. 미리보기에서 가져오기를 한 번 실행해 10월 건만 들어오는지 숫자로 확인합니다.
4. 운영 사이트에 탭이 보이려면 확인 후 게시(Publish)가 필요합니다.

## Technical
- Restore QR pieces removed in commits 157fcaa / 12ed3ba (QR_SPREADSHEET_ID, sheet "설문지 응답 시트 (AUTOFILL)", pool qr_activation, notesLabel "QR 개통 신청 자동 등록", tab + i18n + sync button in customers.lazy.tsx).
- The sync loop already skips formDate < 2026-10-01 for all google-form pools.
- Extend trigger skip_old_received_sheet_rows: pool='qr_activation' and notes like 'QR 개통 신청%' and signup_date < 2026-10-01 → skip.
- Check whether the dashboard hook line removed in 2ee3130 should be restored.
