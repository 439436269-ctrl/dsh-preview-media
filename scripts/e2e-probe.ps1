# E2E probe for dsh-preview-media against a locally started web host.
# Usage: pwsh -File probe.ps1 -Base http://127.0.0.1:PORT -Token <token>
param(
  [Parameter(Mandatory = $true)][string]$Base,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$File = "D:\codes\anime-art\out\video\C_kitsune_shrine_zoompan.mp4"
)

Add-Type -AssemblyName System.Net.Http

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.CookieContainer = New-Object System.Net.CookieContainer
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)

$login = $client.GetAsync("$Base/?token=$Token").Result
Write-Output "login status: $([int]$login.StatusCode)"
$cookie = ($handler.CookieContainer.GetCookies([uri]$Base))[0]
$cookieStr = "$($cookie.Name)=$($cookie.Value)"
Write-Output "cookie: $($cookie.Name)"

function Send-Request {
  param([string]$Url, [string]$Method = 'GET', [string]$Range = $null)
  $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::new($Method), $Url)
  $req.Headers.Add('Cookie', $cookieStr)
  if ($Range) { $req.Headers.Range = [System.Net.Http.Headers.RangeHeaderValue]::Parse($Range) }
  return $client.SendAsync($req).Result
}

$bundle = Send-Request "$Base/plugins/dsh-preview-media/client.js"
$bundleBody = $bundle.Content.ReadAsStringAsync().Result
Write-Output "bundle: status=$([int]$bundle.StatusCode) bytes=$($bundleBody.Length)"
Write-Output ("bundle head: " + $bundleBody.Substring(0, [Math]::Min(90, $bundleBody.Length)))

$enc = [uri]::EscapeDataString($File)
$url = "$Base/api/preview/media?path=$enc"
$fileSize = (Get-Item $File).Length
Write-Output "file size: $fileSize"

$head = Send-Request $url 'HEAD'
Write-Output "HEAD: status=$([int]$head.StatusCode) len=$($head.Content.Headers.ContentLength) type=$($head.Content.Headers.ContentType)"

$range = Send-Request $url 'GET' 'bytes=0-1023'
$rangeBody = $range.Content.ReadAsByteArrayAsync().Result
Write-Output "RANGE: status=$([int]$range.StatusCode) bytes=$($rangeBody.Length) content-range=$($range.Content.Headers.ContentRange)"

$mid = Send-Request $url 'GET' 'bytes=1000-2999'
$midBody = $mid.Content.ReadAsByteArrayAsync().Result
Write-Output "MID: status=$([int]$mid.StatusCode) bytes=$($midBody.Length) content-range=$($mid.Content.Headers.ContentRange)"

$full = Send-Request $url 'GET'
$fullBody = $full.Content.ReadAsByteArrayAsync().Result
Write-Output "FULL: status=$([int]$full.StatusCode) bytes=$($fullBody.Length) match=$($fullBody.Length -eq $fileSize)"

$tail = Send-Request $url 'GET' 'bytes=-512'
$tailBody = $tail.Content.ReadAsByteArrayAsync().Result
Write-Output "TAIL: status=$([int]$tail.StatusCode) bytes=$($tailBody.Length) content-range=$($tail.Content.Headers.ContentRange)"

$bad = Send-Request $url 'GET' 'bytes=99999999-'
Write-Output "BAD: status=$([int]$bad.StatusCode) content-range=$($bad.Content.Headers.ContentRange)"

$missing = Send-Request "$Base/api/preview/media?path=D%3A%5Cno%5Csuch%5Cfile.mp4"
Write-Output "MISSING: status=$([int]$missing.StatusCode)"

$relative = Send-Request "$Base/api/preview/media?path=relative.mp4"
Write-Output "RELATIVE: status=$([int]$relative.StatusCode)"

# Content-level check: the first 1 KiB from the range path must equal the head of the file.
$headBytes = [System.IO.File]::ReadAllBytes($File)[0..1023]
$same = $true
for ($i = 0; $i -lt 1024; $i++) { if ($headBytes[$i] -ne $rangeBody[$i]) { $same = $false; break } }
Write-Output "RANGE CONTENT MATCHES FILE HEAD: $same"
