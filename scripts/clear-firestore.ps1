$ErrorActionPreference = "Stop"

$ProjectId = "gen-lang-client-0167602527"

$Collections = @(
  "consolidated_data",
  "consolidated_data_v2",
  "projects",
  "templates",
  "settings",
  "users",
  "assignments",
  "report_exports",
  "units",
  "data_files"
)

Write-Host "Dang chuan bi xoa du lieu Firestore cua project: $ProjectId" -ForegroundColor Yellow
Write-Host "Cac collection se bi xoa:" -ForegroundColor Yellow
$Collections | ForEach-Object { Write-Host " - $_" }

$confirm = Read-Host "Nhap YES de tiep tuc"
if ($confirm -ne "YES") {
  Write-Host "Da huy thao tac." -ForegroundColor Cyan
  exit 0
}

foreach ($collectionName in $Collections) {
  Write-Host "Dang xoa collection: $collectionName" -ForegroundColor Yellow
  firebase firestore:delete $collectionName --project $ProjectId --recursive --force
}

Write-Host "Da xoa xong cac collection Firestore." -ForegroundColor Green
