# Backup Guide

## Trang thai backup da tao local
- Snapshot codebase da tao tai:
  - `C:\CODE_APPWEB\backups\2026-04-06_185755-pre-unit-user-rollout`
- Snapshot nay gom:
  - `src`
  - `docs`
  - `supabase`
  - `scripts`
  - `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`
  - `.env`, `.env.example` neu ton tai

## Backup Supabase cloud
Da tao script:
- `C:\CODE_APPWEB\scripts\backup-supabase-project.mjs`

Da them lenh:
- `npm.cmd run backup:supabase`

## Script backup Supabase se lam gi
- Xuat du lieu cac bang hien co ra JSON trong thu muc backup moi
- Xuat danh sach `Supabase Auth users`
- Xuat `storage manifest` cho bucket `uploads`
- Tao `manifest.json` tong hop ket qua backup

## Cac bang duoc backup
- `projects`
- `templates`
- `units`
- `app_settings`
- `user_profiles`
- `assignments`
- `global_assignments`
- `consolidated_rows`
- `data_files`
- `report_exports`
- `data_overwrite_requests`
- `analysis_cells`
- `ai_analysis_reports`
- `ai_report_blueprints`

Neu bang nao chua ton tai, script se bo qua va ghi vao `_summary.json`.

## Cach chay backup Supabase
1. Mo PowerShell
2. Chuyen vao project:
   - `cd C:\CODE_APPWEB`
3. Nap key server-side moi:
   - `$env:SUPABASE_SERVICE_ROLE_KEY="SECRET_KEY_MOI"`
4. Chay backup:
   - `npm.cmd run backup:supabase`

## Ket qua backup cloud
Script se tao mot thu muc moi trong:
- `C:\CODE_APPWEB\backups\<timestamp>-supabase-backup`

Trong do co:
- `tables\*.json`
- `auth\users.json`
- `storage\uploads.json`
- `manifest.json`

## Luu y
- Script nay chi tao `storage manifest`, khong tai xuong toan bo file nhi phan trong bucket.
- Muon backup ca noi dung file trong bucket thi can mot dot backup rieng, vi dung luong co the lon.
