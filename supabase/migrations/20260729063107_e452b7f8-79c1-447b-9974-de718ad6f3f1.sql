UPDATE public.ai_faq_entries
SET answer_uz = 'Ma''lumotlaringizni tekshirishimiz kerak. Iltimos, hozir foydalanayotgan aloqa operatoringiz nomini, telefon raqamingizni va ism-familiyangizni yozib yuboring.',
    answer_ru = 'Нам нужно проверить ваши данные. Пожалуйста, напишите название вашего оператора связи, ваш номер телефона и ваше ФИО.',
    updated_at = now()
WHERE id IN ('a3270543-4a4e-426e-b536-cdac36b02262','5015e8d8-d0ef-443c-b95d-6488cfccf4b2');