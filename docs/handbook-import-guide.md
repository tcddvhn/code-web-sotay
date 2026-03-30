# Huong dan flatten va import du lieu handbook

## Muc tieu

Tai lieu nay mo ta quy trinh an toan de lay du lieu So tay tu file export `treeData` cua he cu va dua vao bang `handbook_nodes` tren Supabase ma khong dong vao site cu.

## Nguyen tac an toan

1. Khong sua site cu `sotay-dangvien` trong luc export.
2. Chay flatten truoc, review ket qua, roi moi import vao Supabase.
3. Neu can xoa du lieu handbook trong Supabase, chi xoa bang `handbook_nodes`, khong can thiep 2 he thong dang chay.

## Buoc 1 - Chuan bi file export

Can 1 file JSON chua `treeData` tu he cu.

Neu file dau vao la Firestore document export JSON, can extract truoc:

```bash
npm run handbook:extract -- /duong-dan/export.json tmp/handbook-source/treeData.json
```

Vi du:

- `tmp/handbook-source/treeData.json`

## Buoc 2 - Flatten du lieu

Lenh:

```bash
npm run handbook:flatten -- tmp/handbook-source/treeData.json tmp/handbook-export
```

Ket qua:

- `tmp/handbook-export/handbook_nodes_flat.json`
- `tmp/handbook-export/handbook_nodes_review.json`
- `tmp/handbook-export/migration_summary.json`

## Buoc 3 - Review node mo ho

Kiem tra file:

- `tmp/handbook-export/handbook_nodes_review.json`

Nhung node nay thuong can review vi:

- thieu title
- tag mo ho
- map section chua chac chan

Mac dinh script import se bo qua cac node `needs_review = true`.

## Buoc 4 - Chuan bi bien moi truong de import

Can co cac bien sau trong `.env` hoac terminal:

```env
VITE_SUPABASE_URL=https://taivkgwwinakcoxhquyv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Luu y:

- `SUPABASE_SERVICE_ROLE_KEY` chi dung cho script import noi bo.
- Khong commit key nay len git.

## Buoc 5 - Import vao Supabase

### Import an toan, bo qua node can review

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json
```

### Import va xoa sach section truoc do

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json --purge-section quy-dinh
```

### Import va xoa toan bo handbook_nodes truoc do

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json --purge-all
```

### Import ca node dang can review

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json --include-draft
```

## Buoc 6 - Doi chieu sau import

Kiem tra:

1. Tong so node trong `migration_summary.json`
2. Tong so row trong `handbook_nodes`
3. So row theo section:
   - `quy-dinh`
   - `hoi-dap`
   - `bieu-mau`
   - `tai-lieu`
4. Kiem tra mot vai node co:
   - parent_id
   - sort_order
   - pdf_refs
   - file_url / file_name

## File lien quan

- `scripts/flatten-handbook-export.ts`
- `scripts/extract-handbook-tree.ts`
- `scripts/import-handbook-flat.ts`
- `supabase/handbook_schema.sql`
- `docs/handbook-migration-plan.md`
- `docs/handbook-worklog.md`
