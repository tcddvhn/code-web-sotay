# Huong dan xuat JSON tu site So tay cu ma khong sua site cu

## Muc tieu

Lay `treeData` tu trang So tay cu dang chay de phuc vu migrate sang handbook moi tren nen Supabase, **khong dong vao repo `sotay-dangvien`**.

## Cach nhanh nhat

1. Mo trang cu:

- [https://tcddvhn.id.vn](https://tcddvhn.id.vn)

2. Doi trang tai xong het noi dung So tay.

3. Mo `F12` -> `Console`.

4. Mo file sau trong repo moi va copy toan bo:

- [scripts/legacy-handbook-browser-export.js](/Users/tranhau/Documents/GitHub/code-web-sotay/scripts/legacy-handbook-browser-export.js)

5. Paste vao Console va Enter.

6. Trinh duyet se tai ve file JSON, vi du:

- `handbook-treeData-2026-03-30.json`

## Ket qua mong doi

File JSON se co dang:

```json
{
  "exportedAt": "2026-03-30T10:00:00.000Z",
  "source": "https://tcddvhn.id.vn/",
  "treeData": []
}
```

## Buoc tiep theo trong repo moi

Sau khi co file JSON:

1. `handbook:extract`
2. `handbook:flatten`
3. review output
4. `handbook:import`
5. doi chieu handbook moi voi site cu

## Luu y

- Cach nay chi doc du lieu da nap tren browser, khong sua site cu.
- Neu Console bao khong tim thay `APP_DATA`, hay tai lai trang, mo lai dung tab noi dung So tay roi thu lai.
- Neu can xuat lai, co the chay lai snippet them lan nua.
