# Ke hoach migrate du lieu So tay tu Firestore sang Supabase

## Muc tieu

Xuat du lieu tu site cu `sotay-dangvien` de phuc vu xay moi module So tay tren nen `code-web-sotay`, nhung khong sua site cu trong qua trinh nay.

## Nguon du lieu cu

Site cu dang luu noi dung chinh trong Firestore:

- collection/doc: `sotay/dulieu`
- truong du lieu: `treeData`

Ngoai ra con co:

- thong bao
- thong ke
- gop y / khao sat
- du lieu phu tro chat

## Muc tieu migration giai doan dau

Chi migrate phan noi dung cot loi cua So tay:

- cay quy dinh
- hoi dap
- bieu mau
- tai lieu

Thong bao, gop y, chatbot, thong ke se xu ly o pha sau.

## Du lieu can xuat tu node cu

Moi node can thu duoc:

- `id`
- `title`
- `tag`
- `summary`
- `detail`
- `fileUrl`
- `fileName`
- `pdfRefs`
- `pdfPage`
- `forceAccordion`
- danh sach `children`
- thu tu node trong danh sach anh em

## Muc tieu du lieu moi

Moi node sau khi flatten can co:

- `id`
- `legacy_id`
- `parent_id`
- `section`
- `title`
- `slug`
- `tag`
- `summary_html`
- `detail_html`
- `sort_order`
- `level`
- `file_url`
- `file_name`
- `pdf_refs`
- `force_accordion`

## Quy tac map section

Map tu `tag` cu:

- chua `hoi dap` -> `hoi-dap`
- chua `bieu mau` -> `bieu-mau`
- chua `tai lieu` -> `tai-lieu`
- cac truong hop con lai -> `quy-dinh`

Neu mot node co nhieu tag va khong the xep ro:

- danh dau `needs_review = true` trong artifact migration
- review tay truoc khi import chinh thuc

## Quy trinh migration de xuat

### Buoc 1 - Export

Thuc hien export tu site cu, nhung khong chinh sua code dang deploy.

Ket qua mong muon:

- 1 file JSON goc chua `treeData`
- co the la file raw `treeData`
- hoac la Firestore document export JSON

Script extract trong repo moi:

- `npm run handbook:extract -- <input.json> tmp/handbook-export/treeData.json`

Neu file export da co san duoi dang JSON, script flatten trong repo moi co the chay theo mau:

- `npm run handbook:flatten -- /duong-dan/treeData.json`
- hoac `npm run handbook:flatten -- /duong-dan/treeData.json tmp/handbook-export`

### Buoc 2 - Flatten

Viet script flatten cay:

- de quy theo `children`
- gan `parent_id`
- gan `level`
- gan `sort_order`
- map `section`
- chuyen `summary` -> `summary_html`
- chuyen `detail` -> `detail_html`

Artifact dau ra:

- `handbook_nodes_flat.json`
- `handbook_nodes_review.json`

### Buoc 3 - Review

Kiem tra:

- node khong co `title`
- node map section mo ho
- node co `fileUrl` nhung section sai
- node co `pdfPage` nhung chua co `pdfRefs`

### Buoc 4 - Import

Import vao Supabase bang:

- script insert
- hoac CSV/JSON + SQL helper

### Buoc 5 - Doi chieu

Can doi chieu:

- tong so node cu va moi
- tong so node theo section
- node cha/con
- thu tu hien thi
- so file attachment
- so `pdf_refs`

## Nguyen tac an toan

- Khong xoa du lieu Firestore cu
- Khong sua site cu trong qua trinh export
- Migrate theo tung dot nho, uu tien mot section truoc
- Co file artifact review de co the quay lai doi chieu bat cu luc nao

## Uu tien trien khai

1. `Quy dinh`
2. `Hoi dap`
3. `Bieu mau`
4. `Tai lieu`

## Ghi chu ky thuat

- Du lieu cu dang la cay lon trong mot document, khong phai bang phang
- Khi flatten phai giu dung thu tu node
- Neu `pdfPage` ton tai ma `pdfRefs` rong, can tu dong bo sung mot `pdfRef` mac dinh theo quy tac cu
- `slug` can duoc sinh moi o he thong moi, khong phu thuoc truc tiep vao title cu neu title thay doi ve sau
