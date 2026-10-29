[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$PythonwPath,
 [Parameter(Mandatory=$true)][string]$RegistryPath,
 [Parameter(Mandatory=$true)][string]$CachePath,
 [Parameter(Mandatory=$true)][string]$HostName,
 [Parameter(Mandatory=$true)][string]$IdentityFile,
 [Parameter(Mandatory=$true)][string]$CommandConfigPath,
 [Parameter(Mandatory=$true)][string]$BossConfigPath,
 [string]$RuntimeDirectory=(Join-Path $env:LOCALAPPDATA 'AskiAgentOffice'),
 [switch]$DryRun
)
$ErrorActionPreference='Stop'
$taskName='AskiAgentOfficeMetadataExporter'
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach($path in @($PythonwPath,$RegistryPath,$CachePath,$IdentityFile,$CommandConfigPath,$BossConfigPath,$RuntimeDirectory)) {
 if(-not [IO.Path]::IsPathRooted($path) -or $path.Contains('"')) {throw 'Expected fixed absolute paths'}
}
if([IO.Path]::GetFileName($PythonwPath) -ne 'pythonw.exe'){throw 'pythonw.exe required'}
if($HostName -notmatch '^aski@[a-zA-Z0-9-]+\.tail[a-zA-Z0-9]+\.ts\.net$'){throw 'Invalid tailnet host'}
foreach($path in @($PythonwPath,$RegistryPath,$IdentityFile,$CommandConfigPath,$BossConfigPath)){if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Missing fixed installation input'}}
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$sourceRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$exporter=Join-Path $RuntimeDirectory 'scripts/agent-status/export-windows.py'
$commandTarget=Join-Path $RuntimeDirectory 'command-config.json'
$bossTarget=Join-Path $RuntimeDirectory 'boss-config.json'
$arguments='"{0}" --registry "{1}" --cache "{2}" --host "{3}" --key "{4}" --command-config "{5}"' -f $exporter,$RegistryPath,$CachePath,$HostName,$IdentityFile,$commandTarget
if($DryRun){Write-Output 'DryRun: validate inputs; back up and update existing AskiAgentOfficeMetadataExporter; install fixed modules and Boss skill; current-user logon, pythonw, IgnoreNew, unlimited runtime. No changes applied.';return}
New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner([Security.Principal.NTAccount]::new($user))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
Set-Acl -LiteralPath $RuntimeDirectory -AclObject $acl
$backup=Join-Path $RuntimeDirectory ('backup-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'task.xml') -Encoding Unicode
foreach($name in @('scripts','command-config.json','boss-config.json')){
 $old=Join-Path $RuntimeDirectory $name
 if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $backup -Recurse}
}
foreach($name in @('agent-office','agent-status')){New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeDirectory ('scripts/'+$name)) | Out-Null}
foreach($name in @('queue_bridge.py','boss_control.py')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $RuntimeDirectory 'scripts/agent-office') -Force}
foreach($name in @('collector.py','export-windows.py')){Copy-Item -LiteralPath (Join-Path $sourceRoot ('scripts/agent-status/'+$name)) -Destination (Join-Path $RuntimeDirectory 'scripts/agent-status') -Force}
Copy-Item -LiteralPath $CommandConfigPath -Destination $commandTarget -Force
Copy-Item -LiteralPath $BossConfigPath -Destination $bossTarget -Force
$skillTarget=Join-Path $env:USERPROFILE '.codex/skills/agent-office-boss'
if(Test-Path -LiteralPath $skillTarget){Copy-Item -LiteralPath $skillTarget -Destination (Join-Path $backup 'skill') -Recurse}
New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'skills/agent-office-boss/SKILL.md') -Destination $skillTarget -Force
# Replace retained explicit ACLs too; overwriting an existing file can preserve them.
foreach($item in Get-ChildItem -LiteralPath $RuntimeDirectory -Recurse -Force){
 if($item.PSIsContainer){$itemAcl=New-Object Security.AccessControl.DirectorySecurity}else{$itemAcl=New-Object Security.AccessControl.FileSecurity}
 $itemAcl.SetAccessRuleProtection($true,$false)
 $itemAcl.SetOwner([Security.Principal.NTAccount]::new($user))
 if($item.PSIsContainer){$itemAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}else{$itemAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,'FullControl','Allow'))}
 Set-Acl -LiteralPath $item.FullName -AclObject $itemAcl
}
$action=New-ScheduledTaskAction -Execute $PythonwPath -Argument $arguments
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output ('Installed existing task update. Reversible backup: '+$backup)
# Root controls activation and original Boss environment. Never start another runner here.
