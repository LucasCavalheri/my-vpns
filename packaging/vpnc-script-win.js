// OpenConnect invokes this through cscript.exe. Use an absolute, bundled
// PowerShell script; no values received from a VPN server become shell code.
var shell = new ActiveXObject('WScript.Shell');
var fs = new ActiveXObject('Scripting.FileSystemObject');
var script = fs.BuildPath(fs.GetParentFolderName(WScript.ScriptFullName), 'windows-network.ps1');
var powershell = shell.ExpandEnvironmentStrings('%SystemRoot%') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
var proc = shell.Exec('"' + powershell + '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + script + '"');
while (!proc.StdOut.AtEndOfStream) WScript.StdOut.WriteLine(proc.StdOut.ReadLine());
while (!proc.StdErr.AtEndOfStream) WScript.StdErr.WriteLine(proc.StdErr.ReadLine());
WScript.Quit(proc.ExitCode);
