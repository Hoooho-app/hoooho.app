$ErrorActionPreference = 'Stop'

$root = Join-Path $PSScriptRoot 'fixtures'
$imageDir = Join-Path $root 'images'
$audioDir = Join-Path $root 'audio'
$textDir = Join-Path $root 'text'
New-Item -ItemType Directory -Force -Path $imageDir, $audioDir, $textDir | Out-Null

Add-Type -AssemblyName System.Drawing

function New-Canvas([int]$width = 1200, [int]$height = 900, [string]$background = '#F4F7F5') {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($background))
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Jpeg($canvas, [string]$path, [long]$quality = 92) {
  $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
  $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
  $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, $quality)
  $canvas.Bitmap.Save($path, $encoder, $parameters)
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
  $parameters.Dispose()
}

function Add-Text($graphics, [string]$text, [float]$size, [float]$x, [float]$y, [string]$color = '#173B37', [string]$family = 'Microsoft YaHei', [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  $font = [System.Drawing.Font]::new($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))
  $graphics.DrawString($text, $font, $brush, $x, $y)
  $font.Dispose(); $brush.Dispose()
}

function New-Thermometer([string]$path, [string]$value, [switch]$Glare, [switch]$Blurred, [switch]$Rotate) {
  $c = New-Canvas
  $g = $c.Graphics
  $body = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#B6CBC7'), 8)
  $screen = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($(if ($Blurred) { '#CAD0CE' } else { '#DDE8E4' })))
  $g.FillRectangle($body, 150, 270, 900, 330)
  $g.DrawRectangle($border, 150, 270, 900, 330)
  $g.FillRectangle($screen, 280, 350, 560, 160)
  Add-Text $g $(if ($Blurred) { '8?.?' } else { "$value ℃" }) 112 325 360 '#203431' 'Consolas' ([System.Drawing.FontStyle]::Bold)
  Add-Text $g 'SYNTHETIC TEST FIXTURE' 26 390 650 '#6D807C'
  if ($Glare) {
    $glareBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(225, 255, 255, 255))
    $g.FillPolygon($glareBrush, @([System.Drawing.Point]::new(650, 320), [System.Drawing.Point]::new(860, 320), [System.Drawing.Point]::new(760, 545), [System.Drawing.Point]::new(550, 545)))
    $glareBrush.Dispose()
  }
  $body.Dispose(); $border.Dispose(); $screen.Dispose()
  if ($Rotate) { $c.Bitmap.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  Save-Jpeg $c $path
}

function New-Document([string]$path, [string]$title, [string[]]$lines) {
  $c = New-Canvas 1400 1900 '#FFFFFF'
  Add-Text $c.Graphics $title 54 100 90 '#173B37' 'Microsoft YaHei' ([System.Drawing.FontStyle]::Bold)
  Add-Text $c.Graphics '合成测试资料 / 非真实患者' 28 100 175 '#B03A2E'
  $y = 280
  foreach ($line in $lines) { Add-Text $c.Graphics $line 34 110 $y '#263B38'; $y += 78 }
  Save-Jpeg $c $path 94
}

function New-MedicineBox([string]$path, [switch]$Two) {
  $c = New-Canvas 1400 900 '#EEF4F1'
  $g = $c.Graphics
  $box1 = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $accent1 = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2B8A78'))
  $g.FillRectangle($box1, 100, 190, $(if ($Two) { 560 } else { 1200 }), 500)
  $g.FillRectangle($accent1, 100, 190, $(if ($Two) { 560 } else { 1200 }), 90)
  Add-Text $g '布洛芬混悬液' 55 150 350 '#183D38' 'Microsoft YaHei' ([System.Drawing.FontStyle]::Bold)
  Add-Text $g '合成药盒测试图 · 未表示已经服用' 26 150 455 '#687B77'
  if ($Two) {
    $accent2 = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#6381B5'))
    $g.FillRectangle($box1, 740, 190, 560, 500); $g.FillRectangle($accent2, 740, 190, 560, 90)
    Add-Text $g '对乙酰氨基酚' 51 790 350 '#243A5A' 'Microsoft YaHei' ([System.Drawing.FontStyle]::Bold)
    Add-Text $g '合成药盒测试图' 26 790 455 '#687B77'
    $accent2.Dispose()
  }
  $box1.Dispose(); $accent1.Dispose()
  Save-Jpeg $c $path
}

function New-SimplePhoto([string]$path, [string]$kind) {
  $c = New-Canvas 1200 900 $(if ($kind -eq 'skin') { '#E9C1A7' } else { '#D9E1DE' })
  if ($kind -eq 'skin') {
    $rash = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(115, 180, 62, 75))
    $random = [System.Random]::new(20260831)
    1..18 | ForEach-Object { $x = $random.Next(250, 950); $y = $random.Next(180, 700); $r = $random.Next(20, 65); $c.Graphics.FillEllipse($rash, $x, $y, $r, $r) }
    $rash.Dispose(); Add-Text $c.Graphics 'SYNTHETIC SKIN-LIKE FIXTURE · NO BODY LOCATION' 24 250 805 '#70433B'
  } else {
    $desk = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#A97B50'))
    $paper = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $c.Graphics.FillRectangle($desk, 0, 390, 1200, 510); $c.Graphics.FillRectangle($paper, 170, 180, 480, 340)
    Add-Text $c.Graphics 'DESK' 58 300 300 '#5B6B68' 'Arial' ([System.Drawing.FontStyle]::Bold)
    $desk.Dispose(); $paper.Dispose()
  }
  Save-Jpeg $c $path
}

New-Thermometer (Join-Path $imageDir 'P01-thermometer-38.6.jpg') '38.6'
New-Thermometer (Join-Path $imageDir 'P02-thermometer-39.1-rotated.jpg') '39.1' -Rotate
New-Thermometer (Join-Path $imageDir 'P03-thermometer-glare.jpg') '38.7' -Glare
New-Thermometer (Join-Path $imageDir 'P04-severely-blurred.jpg') '38.6' -Blurred
New-Thermometer (Join-Path $imageDir 'M02-glare-ocr-39.8.jpg') '39.8' -Glare
New-Thermometer (Join-Path $imageDir 'M04-thermometer-38.7.jpg') '38.7'
New-MedicineBox (Join-Path $imageDir 'P06-ibuprofen-box.jpg')
New-MedicineBox (Join-Path $imageDir 'P08-two-medicines.jpg') -Two
New-Document (Join-Path $imageDir 'P09-synthetic-lab-report.jpg') '合成血液检查报告' @('姓名：测试宝宝', '报告日期：2026-08-31', '白细胞 12.8 ×10^9/L    参考范围 4.0–10.0', '血红蛋白 118 g/L       参考范围 110–160', 'C反应蛋白 16 mg/L      参考范围 0–8')
New-Document (Join-Path $imageDir 'P10-synthetic-prescription.jpg') '合成就诊报告' @('报告日期：2026-08-31', '报告记载：荨麻疹', '处方：氯雷他定糖浆', '说明：本图仅用于自动化测试')
New-SimplePhoto (Join-Path $imageDir 'P11-synthetic-skin.jpg') 'skin'
New-SimplePhoto (Join-Path $imageDir 'P13-unrelated-desk.jpg') 'desk'
New-Document (Join-Path $imageDir 'P14-chat-screenshot.jpg') '合成聊天截图' @('家人：宝宝好像38度5，你再量一下。', '照护者：好的，我重新确认。', '提示：这是他人转述，不是已确认测量。')

$sourceJpeg = [System.IO.File]::ReadAllBytes((Join-Path $imageDir 'P01-thermometer-38.6.jpg'))
foreach ($sizeMb in @(8, 21)) {
  $oversized = [byte[]]::new($sizeMb * 1024 * 1024 + 1)
  [Array]::Copy($sourceJpeg, $oversized, $sourceJpeg.Length)
  [System.IO.File]::WriteAllBytes((Join-Path $imageDir "P05-${sizeMb}mb.jpg"), $oversized)
}
[System.IO.File]::WriteAllBytes((Join-Path $imageDir 'P05-iphone.heic'), $sourceJpeg)

@{ cases = @('8MB JPEG', '20MB+ JPEG', 'iPhone HEIC', 'high-resolution portrait'); generated = $false; reason = 'capability matrix; oversized and HEIC are expected to be rejected before upload' } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $imageDir 'P05-size-matrix.json')
@{ sequence = @('P01-thermometer-38.6.jpg', 'P06-ibuprofen-box.jpg', 'P11-synthetic-skin.jpg') } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $imageDir 'P16-sequence.json')
@{ scenarios = @('picker cancel', 'network interruption', 'image processing failure', 'rapid repeated click') } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $imageDir 'P17-failure-matrix.json')
@{ metrics = @('previewMs', 'compressionMs', 'uploadMs', 'aiMs', 'timelineMs', 'longTaskDetected') } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $imageDir 'P18-performance.json')

$audioCases = @{
  'A01-mumbled-repeated.wav'='孩，孩子，烧，烧到三十九度二，刚，刚才喂了五毫升布洛芬。'; 'A02-low-elderly.wav'='昨晚咳得厉害，今天早上好一点了。';
  'A03-fast-no-punctuation.wav'='今天早上八点三十七度八十点半三十八度五十一点吃了美林五毫升现在还是有点咳但是没吐。'; 'A04-stutter-correction.wav'='他他他刚才吐了，吐了两次，不不不是三次，是两次。';
  'A05-interrupted.wav'='孩子现在呼吸好像有点'; 'A06-clipped.wav'='体温三十八度六。'; 'A07-distant-reverb.wav'='右边胳膊起了一片红疹，很痒。';
  'A08-baby-cry.wav'='刚量体温三十八度四，孩子一直哭，奶喝得比平时少。'; 'A09-tv-background.wav'='孩子现在没有发烧，只是有点咳嗽。';
  'A10-overlap-speakers.wav'='宝宝晚上咳了几次。'; 'A11-speed-change.wav'='九点体温三十八度七，十点已经降到三十七度九。'; 'A12-muffled.wav'='鼻子堵，嗓子疼，但是没有发烧。';
  'P07-dose.wav'='刚才十点二十喂了五毫升。'; 'P08-left.wav'='刚吃了左边这个五毫升。'; 'P12-location.wav'='右胳膊，今天刚发现，特别痒。';
  'M01-39.6.wav'='刚量的是三十九度六。'; 'M02-correction.wav'='照片反光了，实际是三十八度八。'; 'M03-acetaminophen.wav'='刚才吃的是对乙酰氨基酚。';
  'M04-vague.wav'='大概三十八度吧。'; 'M05-vomit.wav'='孩子刚才吐了两次。'; 'M06-two-doses.wav'='昨晚十点吃了五毫升，今天早上八点又吃了五毫升。'
}

try {
  $voice = New-Object -ComObject SAPI.SpVoice
  foreach ($item in $audioCases.GetEnumerator()) {
    $stream = New-Object -ComObject SAPI.SpFileStream
    $stream.Open((Join-Path $audioDir $item.Key), 3, $false)
    $voice.AudioOutputStream = $stream
    $voice.Rate = if ($item.Key -match 'fast') { 6 } elseif ($item.Key -match 'elderly') { -4 } else { 0 }
    $voice.Volume = if ($item.Key -match 'low|distant') { 22 } else { 100 }
    [void]$voice.Speak($item.Value)
    $stream.Close()
  }
} catch {
  throw "Windows SAPI 中文合成音频生成失败；不得用文本冒充音频。$($_.Exception.Message)"
}

Write-Host "Synthetic fixtures generated under $root"
