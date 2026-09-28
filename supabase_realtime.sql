-- شغّل السطور دي كمان (مرة واحدة) عشان تفعّل التزامن اللحظي بين الأجهزة
-- لو ظهر خطأ يقول إن الجدول already member of publication، يبقى ده معناه إنه شغّال بالفعل — تجاهل الخطأ
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table ratings;
