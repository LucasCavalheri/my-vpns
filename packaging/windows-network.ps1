# OpenConnect vpnc-script environment. Only manage settings owned by this tunnel.
$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $env:MYVPNS_SESSION_DIR 'network-state.json'
$utf8 = New-Object Text.UTF8Encoding($false)
function Get-OtherRoutes {
    $root = Split-Path -Parent $env:MYVPNS_SESSION_DIR
    # TEMP may use an 8.3 path (RUNNER~1, for example), while enumeration
    # returns long paths. Compare canonical directory names within this root
    # so our own state cannot be mistaken for another active session.
    $currentName = (Get-Item -LiteralPath $env:MYVPNS_SESSION_DIR).Name
    foreach ($dir in Get-ChildItem -LiteralPath $root -Directory -Filter 'session-*') {
        $file = Join-Path $dir.FullName 'network-state.json'
        if ($dir.Name -ne $currentName -and (Test-Path -LiteralPath $file)) {
            try { (Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json).routes } catch { }
        }
    }
}
function Other-UsesRoute([string]$prefix, [int]$index, [string]$nextHop) {
    return [bool]@(Get-OtherRoutes | Where-Object { $_.prefix -eq $prefix -and $_.index -eq $index -and $_.nextHop -eq $nextHop }).Count
}
function Save-State { [IO.File]::WriteAllText($stateFile, ($script:state | ConvertTo-Json -Depth 8), $utf8) }
function Add-OwnedRoute([string]$prefix, [int]$index, [string]$nextHop) {
    $exists = Get-NetRoute -DestinationPrefix $prefix -InterfaceIndex $index -NextHop $nextHop -ErrorAction SilentlyContinue
    if (!$exists -or (Other-UsesRoute $prefix $index $nextHop)) {
        # Record intent first so a partial failure can still be rolled back.
        $script:state.routes += @{ prefix=$prefix; index=$index; nextHop=$nextHop }
        Save-State
        if (!$exists) { New-NetRoute -DestinationPrefix $prefix -InterfaceIndex $index -NextHop $nextHop -RouteMetric 1 -PolicyStore ActiveStore | Out-Null }
    }
}
function Restore-Network {
    if (!(Test-Path -LiteralPath $stateFile)) { return }
    $saved = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $adapter = Get-NetAdapter -IncludeHidden | Where-Object { $_.ifIndex -eq $saved.index } | Select-Object -First 1
    foreach ($route in $saved.routes) {
        if ($route.index -eq $saved.index -and (!$adapter -or $adapter.InterfaceGuid.ToString() -ne $saved.guid)) { continue }
        if (Other-UsesRoute $route.prefix $route.index $route.nextHop) { continue }
        Get-NetRoute -DestinationPrefix $route.prefix -InterfaceIndex $route.index -NextHop $route.nextHop -ErrorAction SilentlyContinue |
            Remove-NetRoute -Confirm:$false -ErrorAction Stop
    }
    if ($adapter -and $adapter.InterfaceGuid.ToString() -eq $saved.guid) {
        if ($saved.dnsChanged) {
            if (@($saved.dns).Count) { Set-DnsClientServerAddress -InterfaceIndex $saved.index -ServerAddresses @($saved.dns) }
            else { Set-DnsClientServerAddress -InterfaceIndex $saved.index -ResetServerAddresses }
            Set-DnsClient -InterfaceIndex $saved.index -ConnectionSpecificSuffix ([string]$saved.suffix)
            if ($saved.automaticMetric -eq 'Enabled') { Set-NetIPInterface -InterfaceIndex $saved.index -AddressFamily IPv4 -AutomaticMetric Enabled }
            else { Set-NetIPInterface -InterfaceIndex $saved.index -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric $saved.metric }
        }
        if ($saved.ipAdded) {
            Get-NetIPAddress -InterfaceIndex $saved.index -IPAddress $saved.ip -ErrorAction SilentlyContinue |
                Remove-NetIPAddress -Confirm:$false -ErrorAction Stop
        }
    }
    Remove-Item -LiteralPath $stateFile
}
$mutex = New-Object Threading.Mutex($false, 'Global\MyVPNsNetwork-v1')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Timed out waiting for another VPN network operation.' }
    if ($env:reason -eq 'disconnect') { Restore-Network; return }
    if ($env:reason -notin @('connect', 'reconnect')) { return }
    if ($env:reason -eq 'reconnect') { Restore-Network }
    $index = [int]$env:TUNIDX
    $adapter = Get-NetAdapter -IncludeHidden | Where-Object { $_.ifIndex -eq $index } | Select-Object -First 1
    if (!$adapter) { throw 'VPN adapter not found.' }
    $ip = [Net.IPAddress]::Parse($env:INTERNAL_IP4_ADDRESS)
    if ($ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'An IPv4 tunnel address is required.' }
    $script:state = @{ index=$index; guid=$adapter.InterfaceGuid.ToString(); routes=@(); ip=$ip.ToString(); ipAdded=$false;
        dns=@((Get-DnsClientServerAddress -InterfaceIndex $index -AddressFamily IPv4).ServerAddresses);
        suffix=(Get-DnsClient -InterfaceIndex $index).ConnectionSpecificSuffix; dnsChanged=$false }
    $ipInterface = Get-NetIPInterface -InterfaceIndex $index -AddressFamily IPv4
    $script:state.metric = [int]$ipInterface.InterfaceMetric
    $script:state.automaticMetric = [string]$ipInterface.AutomaticMetric
    Save-State
    $setRoutes = $env:MYVPNS_SET_ROUTES -eq '1'
    $setDns = $env:MYVPNS_SET_DNS -eq '1'
    if ($setRoutes) {
        $gateway = [Net.IPAddress]::Parse($env:VPNGATEWAY)
        $transport = Find-NetRoute -RemoteIPAddress $gateway.ToString() | Where-Object { $_.NextHop } | Select-Object -First 1
        if (!$transport) { throw 'Could not determine the original route to the VPN gateway.' }
        $bits = if ($gateway.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) { 32 } else { 128 }
        Add-OwnedRoute ($gateway.ToString() + '/' + $bits) $transport.InterfaceIndex $transport.NextHop
    }
    if (!(Get-NetIPAddress -InterfaceIndex $index -IPAddress $ip.ToString() -ErrorAction SilentlyContinue)) {
        $script:state.ipAdded = $true
        Save-State
        New-NetIPAddress -InterfaceIndex $index -IPAddress $ip.ToString() -PrefixLength 32 -PolicyStore ActiveStore | Out-Null
    }
    if ($setRoutes) {
        if ($env:CISCO_SPLIT_INC) {
            for ($i=0; $i -lt [int]$env:CISCO_SPLIT_INC; $i++) {
                $address = [Net.IPAddress]::Parse([Environment]::GetEnvironmentVariable("CISCO_SPLIT_INC_${i}_ADDR"))
                $mask = [int][Environment]::GetEnvironmentVariable("CISCO_SPLIT_INC_${i}_MASKLEN")
                if ($mask -lt 0 -or $mask -gt 32) { throw 'Invalid VPN route prefix.' }
                Add-OwnedRoute ($address.ToString() + '/' + $mask) $index '0.0.0.0'
            }
        } else {
            Add-OwnedRoute '0.0.0.0/1' $index '0.0.0.0'
            Add-OwnedRoute '128.0.0.0/1' $index '0.0.0.0'
        }
        for ($i=0; $i -lt [int]$env:CISCO_SPLIT_EXC; $i++) {
            $address = [Net.IPAddress]::Parse([Environment]::GetEnvironmentVariable("CISCO_SPLIT_EXC_${i}_ADDR"))
            $mask = [int][Environment]::GetEnvironmentVariable("CISCO_SPLIT_EXC_${i}_MASKLEN")
            if ($mask -lt 0 -or $mask -gt 32) { throw 'Invalid VPN excluded route prefix.' }
            Add-OwnedRoute ($address.ToString() + '/' + $mask) $transport.InterfaceIndex $transport.NextHop
        }
    }
    if ($setDns) {
        $servers = @($env:INTERNAL_IP4_DNS -split '\s+' | Where-Object { $_ } | ForEach-Object { [Net.IPAddress]::Parse($_).ToString() })
        if (!$servers.Count) { throw 'set-dns=1 but no VPN DNS servers were received.' }
        $script:state.dnsChanged = $true
        Save-State
        Set-DnsClientServerAddress -InterfaceIndex $index -ServerAddresses $servers
        Set-NetIPInterface -InterfaceIndex $index -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 1
        if ($env:CISCO_DEF_DOMAIN) { Set-DnsClient -InterfaceIndex $index -ConnectionSpecificSuffix $env:CISCO_DEF_DOMAIN }
    }
    Write-Output 'MYVPNS_TUNNEL_UP'
} catch {
    [Console]::Error.WriteLine("ERROR: VPN network configuration: " + $_.Exception.Message)
    [IO.File]::WriteAllText((Join-Path $env:MYVPNS_SESSION_DIR 'stop'), '', $utf8)
    if ($locked) { try { Restore-Network } catch { [Console]::Error.WriteLine("ERROR: VPN cleanup: " + $_.Exception.Message) } }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
