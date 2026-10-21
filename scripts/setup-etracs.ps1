# Run once for each Windows user who needs the Open eTRACS button.
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$EtracsLauncher = 'C:\etracs255-platform\etracs25_platform.bat'
)

$ErrorActionPreference = 'Stop'
$launcher = Get-Item -LiteralPath $EtracsLauncher
if ($launcher.PSIsContainer -or $launcher.Extension -ne '.bat') {
    throw 'Select the installed eTRACS .bat launcher.'
}

$protocolPath = 'Software\Classes\ledgerdex-etracs'
$description = 'URL:Open eTRACS from LedgerDex'
$existing = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($protocolPath)
if ($existing) {
    try {
        if ($existing.GetValue('') -ne $description) {
            throw 'ledgerdex-etracs is already registered to another application.'
        }
    } finally {
        $existing.Dispose()
    }
}

# Use literal paths in a fixed command. Never include %1 or any URI arguments:
# web links can launch eTRACS, but cannot supply shell commands or application data.
$launcherLiteral = $launcher.FullName.Replace("'", "''")
$directoryLiteral = $launcher.DirectoryName.Replace("'", "''")
$launchCommand = "Start-Process -FilePath '$launcherLiteral' -WorkingDirectory '$directoryLiteral' -WindowStyle Hidden"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launchCommand))
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$command = '"{0}" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand {1}' -f $powershellPath, $encodedCommand

if ($PSCmdlet.ShouldProcess('HKCU\' + $protocolPath, 'Register the local eTRACS launcher')) {
    $protocol = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($protocolPath)
    try {
        $protocol.SetValue('', $description)
        $protocol.SetValue('URL Protocol', '')
        $openCommand = $protocol.CreateSubKey('shell\open\command')
        try {
            $openCommand.SetValue('', $command)
        } finally {
            $openCommand.Dispose()
        }
    } finally {
        $protocol.Dispose()
    }
    Write-Output "Open eTRACS is ready for this Windows user: $($launcher.FullName)"
}
