# 왼쪽 메뉴 글자 잘 보이게

캡처한 왼쪽 메뉴의 글자가 작고 흐려서 잘 안 보입니다. 기능은 바꾸지 않고 보이는 모습만 고칩니다.

## 바꾸는 것
- **메뉴 글자**: 15px로 키우고 조금 더 굵고 진한 검정색으로 바꿉니다. 메뉴 한 줄 높이도 늘려 누르기 쉽게 합니다.
- **아이콘**: 18px로 키우고 흐린 회색 대신 진한 색으로 바꿉니다.
- **현재 메뉴**: 연한 분홍 배경에 빨간 글자·굵게, 왼쪽에 빨간 세로 막대를 넣어 지금 어디인지 바로 보이게 합니다.
- **그룹 제목(메인·분석·시스템)**: 흐린 색을 진하게, 글자를 약간 키우고 굵게 합니다.
- **알림 숫자(8, 1)**: 조금 더 크게 합니다.
- **위쪽 로고 영역 / 아래쪽 사용자 이름·언어 버튼**: 흐린 글자를 진하게, 크기를 키웁니다.
- 어두운 화면 모드에서도 똑같이 선명하게 보이게 합니다.

## Technical
- Only src/components/AppSidebar.tsx classes (+ sidebar tokens in src/styles.css if needed). Replace /40–/60 opacity text with sidebar-foreground/80–full, text-[13px]/xs → 14–15px, icons h-4.5, active state border-l + bg-primary/10.
