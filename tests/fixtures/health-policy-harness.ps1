# Execute the production decision function without starting an elevated client.
$tokens=$null
$parseErrors=$null
$source=Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'packaging/windows-vpn.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Supervisor does not parse.' }
$definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-HealthDecision'},$true)
if (!$definition) { throw 'Missing production health policy.' }
. ([scriptblock]::Create($definition.Extent.Text))
$service=@{ok=$false;category='service'}
$network=@{ok=$false;category='network'}
$results=@()
$failures=0
foreach ($health in @($service,$service,@{ok=$true},$service,$service,$service)) {
    $decision=Get-HealthDecision $health $true $failures 100
    $results+=$decision
    $failures=$decision.failures
}
@{
    sequence=$results
    networkLoss=(Get-HealthDecision $network $true 0 100)
    starting=(Get-HealthDecision $service $false 0 5)
    startupExpired=(Get-HealthDecision $service $false 0 16)
} | ConvertTo-Json -Depth 6 -Compress
