$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetPath = Join-Path $projectRoot 'assets'
New-Item -ItemType Directory -Path $assetPath -Force | Out-Null

Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

try {
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $background = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = 48
    $background.AddArc(0, 0, $radius, $radius, 180, 90)
    $background.AddArc($size - $radius, 0, $radius, $radius, 270, 90)
    $background.AddArc($size - $radius, $size - $radius, $radius, $radius, 0, 90)
    $background.AddArc(0, $size - $radius, $radius, $radius, 90, 90)
    $background.CloseFigure()
    $graphics.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 24, 39))), $background)

    $clockRect = New-Object System.Drawing.RectangleF(40, 40, 176, 176)
    $graphics.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 48, 72))), $clockRect)
    $clockPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 125, 211, 252), 8)
    $clockPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $clockPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawEllipse($clockPen, $clockRect)

    $handPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 224, 242, 254), 10)
    $handPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $handPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $center = New-Object System.Drawing.PointF(128, 128)
    $graphics.DrawLine($handPen, $center, (New-Object System.Drawing.PointF(128, 84)))
    $graphics.DrawLine($handPen, $center, (New-Object System.Drawing.PointF(166, 146)))
    $graphics.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))), (New-Object System.Drawing.RectangleF(118, 118, 20, 20)))

    $pngPath = Join-Path $assetPath 'icon.png'
    $icoPath = Join-Path $assetPath 'icon.ico'
    $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    $stream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $writer = New-Object System.IO.BinaryWriter($stream)
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]1)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngBytes.Length)
    $writer.Write([UInt32]22)
    $writer.Write($pngBytes)
    $writer.Flush()
    $writer.Dispose()
    $stream.Dispose()
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host "Generated $assetPath\icon.png and $assetPath\icon.ico"
