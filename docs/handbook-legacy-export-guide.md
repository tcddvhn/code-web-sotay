# Huong dan xuat du lieu So tay cu de phuc vu xay moi

## Nguyen tac

- Khong sua repo `sotay-dangvien`
- Khong can deploy lai site cu
- Chi xuat du lieu ra JSON, sau do xu ly trong repo moi `code-web-sotay`

## Muc tieu dau vao

He thong moi can mot file chua `treeData` theo 1 trong 2 dang:

1. JSON raw:

```json
{
  "treeData": []
}
```

2. Firestore document export JSON:

```json
{
  "fields": {
    "treeData": {
      "arrayValue": {
        "values": []
      }
    }
  }
}
```

Script extract moi trong repo se chap nhan ca 2 dang tren.

## Buoc 1 - Extract

Neu ban da co file JSON export cua document `sotay/dulieu`, chay:

```bash
npm run handbook:extract -- /duong-dan/export.json tmp/handbook-export/treeData.json
```

Ket qua:

- `tmp/handbook-export/treeData.json`

## Buoc 2 - Flatten

```bash
npm run handbook:flatten -- tmp/handbook-export/treeData.json tmp/handbook-export
```

Artifact tao ra:

- `tmp/handbook-export/handbook_nodes_flat.json`
- `tmp/handbook-export/handbook_nodes_review.json`
- `tmp/handbook-export/migration_summary.json`

## Buoc 3 - Review

Can kiem tra:

- node khong co title
- tag mo ho khong xep section ro rang
- node co file/pdf nhung phan loai section co the chua dung

## Buoc 4 - Import vao Supabase

Import tat ca:

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json --include-draft
```

Hoac bo qua node can review:

```bash
npm run handbook:import -- tmp/handbook-export/handbook_nodes_flat.json
```

## Thu tu khuyen nghi

1. Extract
2. Flatten
3. Review artifact
4. Import tung dot nho
5. Doi chieu handbook moi voi site cu
