-- 기존 테이블에 삭제 권한 추가 (SQL Editor에서 실행)
drop policy if exists "Anyone can delete diary entries" on diary_entries;
create policy "Anyone can delete diary entries"
  on diary_entries
  for delete
  to anon, authenticated
  using (true);
