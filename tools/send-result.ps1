param(
  [string]$Message = "",
  [string]$MessageFile = "",
  [string]$Subject = "نتيجة العمل - مدارك جو"
)

$ErrorActionPreference = "Stop"
$configPath = Join-Path $PSScriptRoot "email-config.json"

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host "الملف tools/email-config.json غير موجود. انسخ email-config.example.json وعبئه." -ForegroundColor Red
  exit 1
}

$cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

if (-not $Message -and $MessageFile) {
  if (-not (Test-Path -LiteralPath $MessageFile)) {
    Write-Host "ملف الرسالة غير موجود: $MessageFile" -ForegroundColor Red
    exit 1
  }
  $Message = Get-Content -LiteralPath $MessageFile -Raw
}

if (-not $Message) {
  Write-Host "اكتب الرسالة عبر -Message أو -MessageFile" -ForegroundColor Red
  exit 1
}

$smtp = New-Object Net.Mail.SmtpClient($cfg.SmtpServer, [int]$cfg.SmtpPort)
$smtp.EnableSsl = $true
$smtp.Credentials = New-Object System.Net.NetworkCredential($cfg.Email, $cfg.AppPassword)

$mail = New-Object Net.Mail.MailMessage($cfg.Email, $cfg.RecipientEmail, $Subject, $Message)
$mail.IsBodyHtml = $false

$smtp.Send($mail)
Write-Host "تم الإرسال إلى $($cfg.RecipientEmail)" -ForegroundColor Green
