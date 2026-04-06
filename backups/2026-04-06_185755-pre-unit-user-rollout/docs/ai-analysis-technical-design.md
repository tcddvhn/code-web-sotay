# Thiết Kế Kỹ Thuật Module "Phân Tích AI"

Tài liệu này nối tiếp [ai-analysis-ui-spec.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/ai-analysis-ui-spec.md) và chốt thiết kế kỹ thuật cho giai đoạn triển khai phía dưới, với nguyên tắc:

- không ảnh hưởng các module đang chạy ổn định
- không thay đổi hành vi hiện tại của `Dashboard`, `Tiếp nhận dữ liệu`, `Báo cáo`, `Biểu mẫu`
- bổ sung lớp phân tích mới theo hướng tách biệt, có thể bật dần

## 1. Mục tiêu kỹ thuật

Module `Phân tích AI` cần làm được:

1. lấy dữ liệu từ nhiều dự án / nhiều năm / nhiều biểu / nhiều đơn vị
2. chuẩn hóa dữ liệu sang một lớp phân tích riêng
3. tạo các tập dữ liệu tóm tắt để AI diễn giải
4. nhận kết quả AI theo JSON có cấu trúc
5. xuất báo cáo `DOCX` chuẩn văn phòng

## 2. Kiến trúc tổng thể

Kiến trúc đề xuất gồm 5 lớp:

1. `Operational data`
2. `Analytical data mart`
3. `Summary RPC / Views`
4. `AI orchestration`
5. `DOCX generation`

### 2.1. Operational data

Giữ nguyên các bảng hiện tại:

- `projects`
- `templates`
- `units`
- `consolidated_rows`
- `data_files`
- `report_exports`

Không sửa luồng hiện hành của các bảng này.

### 2.2. Analytical data mart

Tạo một bảng mới để bung dữ liệu thô theo từng ô số liệu:

- `analysis_cells`

Mỗi dòng đại diện cho **một ô dữ liệu đã chuẩn hóa**, không còn là mảng `values[]`.

Schema đề xuất:

```sql
create table if not exists analysis_cells (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  project_name text not null,
  template_id text not null references templates(id) on delete cascade,
  template_name text not null,
  sheet_name text not null,
  unit_code text not null references units(code),
  unit_name text not null,
  year text not null,
  source_row integer not null,
  row_label text not null,
  value_index integer not null,
  column_label text not null,
  value numeric not null default 0,
  import_file_id text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Index đề xuất:

```sql
create index if not exists idx_analysis_cells_project_year
  on analysis_cells(project_id, year);

create index if not exists idx_analysis_cells_template
  on analysis_cells(template_id, year);

create index if not exists idx_analysis_cells_unit
  on analysis_cells(unit_code, year);

create index if not exists idx_analysis_cells_scope
  on analysis_cells(project_id, year, template_id, unit_code);
```

## 3. Cơ chế đồng bộ dữ liệu

### 3.1. Không thay đổi luồng nhập hiện tại

Luồng hiện tại vẫn ghi:

- `consolidated_rows`
- `data_files`

### 3.2. Thêm lớp đồng bộ sau khi nhập

Sau khi `upsertRows` thành công, thực hiện thêm một bước:

- chuyển mỗi `DataRow.values[]` thành nhiều dòng `analysis_cells`

Ví dụ:

```ts
DataRow {
  sourceRow: 12,
  label: "Cơ quan Nhà nước",
  values: [12, 8, 4]
}
```

sẽ thành:

```json
[
  { "source_row": 12, "row_label": "Cơ quan Nhà nước", "value_index": 0, "column_label": "Cột 1", "value": 12 },
  { "source_row": 12, "row_label": "Cơ quan Nhà nước", "value_index": 1, "column_label": "Cột 2", "value": 8 },
  { "source_row": 12, "row_label": "Cơ quan Nhà nước", "value_index": 2, "column_label": "Cột 3", "value": 4 }
]
```

### 3.3. Đồng bộ khi xóa

Khi xóa:

- theo đơn vị
- theo năm
- theo dự án

phải xóa tương ứng trong `analysis_cells`.

Nguyên tắc:

- luôn giữ `analysis_cells` là bản phản chiếu của lớp dữ liệu vận hành
- không cho nó trở thành kho dữ liệu độc lập, tránh lệch

## 4. RPC / View cho AI

Không đưa raw `analysis_cells` toàn bộ cho AI nếu phạm vi lớn.

Thay vào đó tạo các RPC/tập tổng hợp trung gian.

### 4.1. RPC tổng quan phạm vi

Tên đề xuất:

- `get_ai_analysis_scope_summary`

Trả về:

- số dự án
- số biểu
- số đơn vị
- số ô dữ liệu
- số đơn vị đã tiếp nhận / chưa tiếp nhận
- tỷ lệ hoàn thành

### 4.2. RPC tổng hợp theo dự án

Tên đề xuất:

- `get_ai_analysis_project_summary`

Trả về theo từng dự án:

- số đơn vị có dữ liệu
- tỷ lệ hoàn thành
- số biểu đã có dữ liệu
- top biểu có nhiều dữ liệu nhất
- top biểu thiếu dữ liệu

### 4.3. RPC tổng hợp theo biểu

Tên đề xuất:

- `get_ai_analysis_template_summary`

Trả về:

- từng biểu
- số đơn vị đã có dữ liệu
- chỉ số chính theo biểu
- các dòng nổi bật / giá trị tổng lớn

### 4.4. RPC so sánh theo năm

Tên đề xuất:

- `get_ai_analysis_year_comparison`

Trả về:

- chênh lệch số đơn vị tiếp nhận
- chênh lệch số liệu chính giữa 2 năm
- nhóm tăng/giảm mạnh

### 4.5. RPC phát hiện bất thường

Tên đề xuất:

- `get_ai_analysis_anomalies`

Trả về:

- đơn vị có biến động quá lớn
- biểu có tỷ lệ bỏ trống cao
- giá trị khác thường

## 5. Input đưa vào AI

### 5.1. Không đưa toàn bộ raw rows khi phạm vi lớn

Nguyên tắc:

- phạm vi nhỏ: có thể cho AI đọc chi tiết hơn
- phạm vi lớn: chỉ đưa summary đã tổng hợp

### 5.2. Payload chuẩn cho AI

Đề xuất một payload JSON chuẩn:

```json
{
  "scope": {
    "projectCount": 3,
    "projectNames": ["Dự án A", "Dự án B", "Dự án C"],
    "year": "2026",
    "analysisType": "FULL",
    "tone": "ADMIN",
    "length": "MEDIUM"
  },
  "summary": {
    "submittedUnits": 120,
    "totalUnits": 132,
    "completionRate": 90.9
  },
  "projectSummaries": [],
  "templateSummaries": [],
  "anomalies": [],
  "userRequirements": "Ưu tiên nhấn mạnh các dự án có tỷ lệ hoàn thành thấp."
}
```

## 6. Output chuẩn từ AI

Không để AI trả text tự do hoàn toàn.

Yêu cầu AI trả JSON có schema cố định:

```json
{
  "title": "Báo cáo phân tích AI",
  "executiveSummary": "....",
  "keyFindings": [
    "....",
    "...."
  ],
  "projectHighlights": [
    {
      "projectName": "Dự án A",
      "summary": "...."
    }
  ],
  "riskItems": [
    {
      "title": "....",
      "detail": "...."
    }
  ],
  "recommendations": [
    "....",
    "...."
  ],
  "appendixTables": [
    {
      "title": "Bảng tóm tắt theo dự án",
      "headers": ["Dự án", "Tỷ lệ hoàn thành"],
      "rows": [["Dự án A", "90.9%"]]
    }
  ]
}
```

Lợi ích:

- dễ kiểm soát
- dễ render preview
- dễ xuất `DOCX`
- dễ phát hiện lỗi

## 7. DOCX chuẩn văn phòng

### 7.1. Không để AI tự format Word

AI chỉ sinh nội dung.

Code chịu trách nhiệm:

- căn lề
- font
- heading
- bảng
- đánh số mục

### 7.2. Mẫu DOCX

Tạo 1 hoặc nhiều mẫu:

- `ai-analysis-standard.docx`
- `ai-analysis-leadership.docx`

Template chứa:

- tiêu đề
- phần mở đầu
- các section cố định
- vị trí bảng phụ lục

### 7.3. Cơ chế điền dữ liệu

Code sẽ map từ JSON output vào:

- tiêu đề
- tóm tắt điều hành
- các mục nhận xét
- các bullet
- bảng phụ lục

## 8. Lịch sử báo cáo AI

Tạo bảng:

- `ai_analysis_reports`

Schema đề xuất:

```sql
create table if not exists ai_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by jsonb,
  project_ids text[] not null,
  years text[] not null,
  scope text not null,
  analysis_type text not null,
  writing_tone text not null,
  report_length text not null,
  selected_template_ids text[] default '{}',
  selected_unit_codes text[] default '{}',
  requested_sections text[] default '{}',
  extra_prompt text default '',
  scope_snapshot jsonb not null,
  ai_input jsonb not null,
  ai_output jsonb,
  docx_file_name text,
  docx_storage_path text,
  docx_download_url text,
  status text not null default 'READY'
);
```

## 9. Luồng xử lý đề xuất

### Bước 1

User chọn:

- nhiều dự án
- năm
- phạm vi
- cấu hình phân tích

### Bước 2

Hệ thống gọi RPC để lấy:

- summary
- project summaries
- template summaries
- anomalies

### Bước 3

Hệ thống build payload JSON chuẩn

### Bước 4

Gọi Gemini qua `@google/genai`

### Bước 5

Nhận JSON output

### Bước 6

Render preview trong UI

### Bước 7

Khi user bấm `Xuất DOCX`:

- dựng DOCX từ template
- upload file
- lưu lịch sử vào `ai_analysis_reports`

## 10. Triển khai theo pha

### Pha 1

- tạo UI
- tạo docs
- chưa gọi AI

### Pha 2

- tạo schema `analysis_cells`
- thêm đồng bộ dữ liệu từ `consolidated_rows`

### Pha 3

- tạo RPC summary
- tạo payload JSON

### Pha 4

- gọi Gemini
- render preview thật

### Pha 5

- xuất DOCX
- lưu lịch sử báo cáo

## 11. Nguyên tắc an toàn

- Không sửa phá luồng `Tiếp nhận dữ liệu` hiện tại.
- Không thay đổi cấu trúc `consolidated_rows` đang chạy.
- Mọi phần phân tích phải đi qua lớp dữ liệu bổ sung mới.
- Nếu thêm đồng bộ sau import, phải theo cơ chế độc lập, rollback được và dễ kiểm tra.
