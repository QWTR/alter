# Makes the Android launcher icons and splash images from the ALTTER icon (apps/web/public/icon-512.png).
# powershell -ExecutionPolicy Bypass -File scripts/icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$src = [System.Drawing.Image]::FromFile((Resolve-Path "$root\..\web\public\icon-512.png"))
$res = "$root\android\app\src\main\res"
$bg = [System.Drawing.ColorTranslator]::FromHtml('#0b0a12')

function New-Canvas([int]$w, [int]$h) {
  $b = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  return @($b, $g)
}
function Save($b, $path) { New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; $b.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose() }

# the icon without its rounded frame: the inner 90 % (the adaptive mask cuts the corners itself)
$crop = [System.Drawing.Rectangle]::new(26, 26, 460, 460)

$dens = @{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }
foreach ($d in $dens.Keys) {
  $f = $dens[$d]
  # legacy icons (Android 7): the whole icon, square and round
  $s = [int](48 * $f)
  $b, $g = New-Canvas $s $s; $g.DrawImage($src, 0, 0, $s, $s); $g.Dispose(); Save $b "$res\mipmap-$d\ic_launcher.png"
  $b, $g = New-Canvas $s $s
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.AddEllipse(0, 0, $s, $s); $g.SetClip($p)
  $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $s, $s), $crop, 'Pixel'); $g.Dispose(); Save $b "$res\mipmap-$d\ic_launcher_round.png"
  # adaptive icon (Android 8+): background = the icon's art, foreground = empty
  $a = [int](108 * $f)
  $b, $g = New-Canvas $a $a; $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $a, $a), $crop, 'Pixel'); $g.Dispose(); Save $b "$res\mipmap-$d\ic_launcher_background.png"
  $b, $g = New-Canvas $a $a; $g.Dispose(); Save $b "$res\mipmap-$d\ic_launcher_foreground.png"
}

# Android 12+ splash icon: the round icon in the middle of a 288dp canvas (only the inner 192dp circle shows)
$b, $g = New-Canvas 1152 1152
$p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.AddEllipse(256, 256, 640, 640); $g.SetClip($p)
$g.DrawImage($src, [System.Drawing.Rectangle]::new(256, 256, 640, 640), $crop, 'Pixel'); $g.Dispose()
Save $b "$res\drawable-nodpi\splash_icon.png"

# older splash (Android 7-11): dark screen with the icon
Get-ChildItem $res -Recurse -Filter splash.png | ForEach-Object {
  $old = [System.Drawing.Image]::FromFile($_.FullName); $w = $old.Width; $h = $old.Height; $old.Dispose()
  $b, $g = New-Canvas $w $h; $g.Clear($bg)
  $s = [int]([Math]::Min($w, $h) * 0.28); $g.DrawImage($src, [int](($w - $s) / 2), [int](($h - $s) / 2), $s, $s); $g.Dispose()
  Save $b $_.FullName
}
$src.Dispose()
Write-Host 'icons ok'
