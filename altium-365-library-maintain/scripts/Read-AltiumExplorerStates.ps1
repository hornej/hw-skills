# The sibling Python launcher supplies a validated request as JSON.
$ErrorActionPreference = 'Stop'
$started = [DateTime]::UtcNow
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
$element = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$pidAltium = [int]$request.pid
$hostControl = $element::FromHandle([IntPtr][long]$request.hwnd)
if ($hostControl.Current.ProcessId -ne $pidAltium) { throw 'Explorer host process changed.' }

function Visible-Matches($root, $searchScope, $property, $value) {
    $condition = [System.Windows.Automation.PropertyCondition]::new($property, $value)
    $root.FindAll($searchScope, $condition) |
        Where-Object { $_.Current.ProcessId -eq $pidAltium -and -not $_.Current.IsOffscreen }
}

function One-Id($root, $searchScope, $id) {
    $hits = @(Visible-Matches $root $searchScope $element::AutomationIdProperty $id)
    if ($hits.Count -ne 1) { throw "Expected one visible Explorer UIA control $id, found $($hits.Count)." }
    $hits[0]
}

# Each end of the read independently checks uniqueness of all four scope
# controls in one descendant traversal. Cache only the properties we use.
$scopeCondition = [System.Windows.Automation.OrCondition]::new(
    [System.Windows.Automation.Condition[]]@(
        [System.Windows.Automation.PropertyCondition]::new($element::NameProperty, $request.workspace),
        [System.Windows.Automation.PropertyCondition]::new($element::NameProperty, 'Generic Search'),
        [System.Windows.Automation.PropertyCondition]::new($element::AutomationIdProperty, 'PART_EditableTextBox'),
        [System.Windows.Automation.PropertyCondition]::new($element::AutomationIdProperty, 'FlexibleBrowseItemsGrid')
    ))
$scopeCache = [System.Windows.Automation.CacheRequest]::new()
foreach ($property in @($element::NameProperty, $element::AutomationIdProperty, $element::ControlTypeProperty,
        $element::ProcessIdProperty, $element::IsOffscreenProperty, $element::RuntimeIdProperty,
        [System.Windows.Automation.ValuePattern]::ValueProperty,
        [System.Windows.Automation.GridPattern]::RowCountProperty,
        [System.Windows.Automation.GridPattern]::ColumnCountProperty)) { $scopeCache.Add($property) }

function Runtime-Parts($control) {
    $runtime = $control.GetCachedPropertyValue($element::RuntimeIdProperty, $true)
    if ($runtime -isnot [int[]] -or -not $runtime.Length) { $runtime = $control.GetRuntimeId() }
    if (-not $runtime.Length) { throw 'Explorer control has no verified runtime identity.' }
    $runtime
}

function Get-ExplorerScope {
    $activation = $scopeCache.Activate()
    try { $hits = $hostControl.FindAll($scope::Descendants, $scopeCondition) }
    finally { $activation.Dispose() }
    $visible = @($hits | Where-Object { $_.Cached.ProcessId -eq $pidAltium -and -not $_.Cached.IsOffscreen })
    $workspace = @($visible | Where-Object { $_.Cached.Name -ceq $request.workspace -and
        $_.Cached.ControlType -eq [System.Windows.Automation.ControlType]::Text -and
        $walker.GetParent($_).Current.ControlType -eq [System.Windows.Automation.ControlType]::Button })
    $generic = @($visible | Where-Object { $_.Cached.Name -ceq 'Generic Search' -and
        $_.Cached.ControlType -eq [System.Windows.Automation.ControlType]::Text })
    $search = @($visible | Where-Object { $_.Cached.AutomationId -ceq 'PART_EditableTextBox' })
    $grids = @($visible | Where-Object { $_.Cached.AutomationId -ceq 'FlexibleBrowseItemsGrid' })
    if ($workspace.Count -ne 1 -or $generic.Count -ne 1 -or $search.Count -ne 1 -or $grids.Count -ne 1 -or
            $search[0].GetCachedPropertyValue([System.Windows.Automation.ValuePattern]::ValueProperty, $true) -cne $request.query) {
        throw 'Exact workspace selector, Generic Search marker, search value, or result grid was not verified.'
    }
    $grid = $grids[0]
    if ($grid.GetCachedPropertyValue([System.Windows.Automation.GridPattern]::RowCountProperty, $true) -ne $request.ids.Count -or
            $grid.GetCachedPropertyValue([System.Windows.Automation.GridPattern]::ColumnCountProperty, $true) -ne 5) {
        throw 'Explorer result dimensions do not match the exact expected cohort.'
    }
    $stamp = @($workspace[0], $generic[0], $search[0], $grid) | ForEach-Object { (Runtime-Parts $_) -join ',' }
    @{ stamp = $stamp -join '|'; grid = $grid }
}

function Cell-Value($children, $id, $columnLabel, $index, $rowIndex) {
    $hits = @($children | Where-Object { $_.Cached.AutomationId -ceq $id -and
        $_.Cached.ProcessId -eq $pidAltium -and -not $_.Cached.IsOffscreen })
    if ($hits.Count -ne 1) { throw "Expected one visible Explorer cell $id, found $($hits.Count)." }
    $cell = $hits[0]
    $value = $cell.GetCachedPropertyValue([System.Windows.Automation.ValuePattern]::ValueProperty, $true)
    $label = "Row $($rowIndex + 1) of $($request.ids.Count), Column $columnLabel, Column $($index + 1) of 5: $value"
    if ($value -isnot [string] -or
            $cell.GetCachedPropertyValue([System.Windows.Automation.GridItemPattern]::RowProperty, $true) -ne $rowIndex -or
            $cell.GetCachedPropertyValue([System.Windows.Automation.GridItemPattern]::ColumnProperty, $true) -ne $index -or
            $cell.Cached.Name -cne $label) {
        throw "Explorer $columnLabel cell no longer matches the exact row and value."
    }
    $value
}

$scopeBefore = Get-ExplorerScope
$presenter = One-Id $scopeBefore.grid $scope::Descendants 'dataPresenter'
$rowCondition = [System.Windows.Automation.PropertyCondition]::new(
    $element::ControlTypeProperty, [System.Windows.Automation.ControlType]::DataItem)
$rowCache = [System.Windows.Automation.CacheRequest]::new()
$rowCache.TreeScope = $scope::Element -bor $scope::Children
$rowCache.TreeFilter = [System.Windows.Automation.Automation]::RawViewCondition
foreach ($property in @($element::NameProperty, $element::AutomationIdProperty, $element::ProcessIdProperty,
        $element::IsOffscreenProperty, $element::RuntimeIdProperty,
        [System.Windows.Automation.ValuePattern]::ValueProperty,
        [System.Windows.Automation.GridItemPattern]::RowProperty,
        [System.Windows.Automation.GridItemPattern]::ColumnProperty)) { $rowCache.Add($property) }
$activation = $rowCache.Activate()
try { $candidates = $presenter.FindAll($scope::Children, $rowCondition) }
finally { $activation.Dispose() }
$rows = @($candidates | Where-Object { $_.Cached.ProcessId -eq $pidAltium -and -not $_.Cached.IsOffscreen })
if ($rows.Count -ne $request.ids.Count) { throw 'The complete expected cohort is not visible in Explorer.' }
$seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$result = @(
    for ($i = 0; $i -lt $rows.Count; $i++) {
        $children = $rows[$i].CachedChildren
        $id = Cell-Value $children 'HRID' 'Revision ID' 1 $i
        $state = Cell-Value $children 'State' 'Revision State' 2 $i
        $name = Cell-Value $children 'Comment' 'Name' 3 $i
        if ($id -cnotin $request.ids -or -not $seen.Add($id) -or
                [string]::IsNullOrWhiteSpace($state) -or
                ($null -ne $request.component_name -and $name -cne $request.component_name)) {
            throw "Unexpected or duplicate Explorer revision, state, or component name in row $($i + 1)."
        }
        [ordered]@{ revision_id = $id; state = $state; name = $name; row_index = $i
                     row_runtime_id = @(Runtime-Parts $rows[$i]) }
    }
)
$scopeAfter = Get-ExplorerScope
if ($scopeAfter.stamp -cne $scopeBefore.stamp) {
    throw 'Explorer workspace, query, or result grid changed during readback.'
}
[ordered]@{ workspace = $request.workspace; query = $request.query; pid = $pidAltium; host_hwnd = $request.hwnd
            observed_utc = [DateTime]::UtcNow.ToString('o')
            worker_ms = [int]([DateTime]::UtcNow - $started).TotalMilliseconds; rows = $result } |
    ConvertTo-Json -Depth 8
