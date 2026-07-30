import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Check,
    MapPin,
    MousePointerClick,
    Pencil,
    Plus,
    ShieldAlert,
    Trash2,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import PzMap from '@/components/pz-map';
import type { DrawnZone, ZoneOverlay } from '@/components/pz-map';
import { SortableHeader } from '@/components/sortable-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useTableSort } from '@/hooks/use-table-sort';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime } from '@/lib/dates';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';
import type { MapConfig } from '@/types/server';

type Zone = {
    id: string;
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

type SafeZoneConfig = {
    enabled: boolean;
    zones: Zone[];
};

type Violation = {
    id: number;
    attacker: string;
    victim: string;
    zone_id: string;
    zone_name: string;
    attacker_x: number | null;
    attacker_y: number | null;
    strike_number: number;
    status: 'pending' | 'dismissed' | 'actioned';
    resolution_note: string | null;
    resolved_by: string | null;
    occurred_at: string;
    resolved_at: string | null;
};

type Props = {
    config: SafeZoneConfig;
    violations: Violation[];
    mapConfig: MapConfig;
    hasTiles: boolean;
};

const ZONE_COLORS = [
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
];

type ViolationSortKey = 'attacker' | 'strike_number' | 'occurred_at' | 'status';

export default function SafeZones({
    config,
    violations,
    mapConfig,
    hasTiles,
}: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Safe Zones', href: '/admin/safe-zones' },
    ];

    const [showAddDialog, setShowAddDialog] = useState(false);
    const {
        sortKey: vSortKey,
        sortDir: vSortDir,
        toggleSort: toggleVSort,
    } = useTableSort<ViolationSortKey>('occurred_at', 'desc');
    const [showDeleteDialog, setShowDeleteDialog] = useState<Zone | null>(null);
    const [showResolveDialog, setShowResolveDialog] =
        useState<Violation | null>(null);
    const [resolveAction, setResolveAction] = useState<
        'dismissed' | 'actioned'
    >('dismissed');
    const [resolveNote, setResolveNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [drawingMode, setDrawingMode] = useState(false);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

    // Add zone form state
    const [newZone, setNewZone] = useState({
        id: '',
        name: '',
        x1: '',
        y1: '',
        x2: '',
        y2: '',
    });

    // Build zone overlays with cycling colors
    const zoneOverlays: ZoneOverlay[] = config.zones.map((zone, i) => ({
        ...zone,
        color: ZONE_COLORS[i % ZONE_COLORS.length],
    }));

    function handleZoneDrawn(zone: DrawnZone) {
        setNewZone({
            id: '',
            name: '',
            x1: String(zone.x1),
            y1: String(zone.y1),
            x2: String(zone.x2),
            y2: String(zone.y2),
        });
        setDrawingMode(false);
        setShowAddDialog(true);
    }

    function handleZoneClick(zone: ZoneOverlay) {
        setSelectedZoneId(selectedZoneId === zone.id ? null : zone.id);
    }

    async function toggleEnabled() {
        setLoading(true);
        await fetchAction('/admin/safe-zones/config', {
            method: 'PATCH',
            data: { enabled: !config.enabled },
            successMessage: config.enabled
                ? 'Safe zones disabled'
                : 'Safe zones enabled',
        });
        setLoading(false);
        router.reload({ only: ['config'] });
    }

    async function handleAddZone() {
        setLoading(true);
        const result = await fetchAction('/admin/safe-zones', {
            data: {
                id: newZone.id,
                name: newZone.name,
                x1: parseInt(newZone.x1, 10),
                y1: parseInt(newZone.y1, 10),
                x2: parseInt(newZone.x2, 10),
                y2: parseInt(newZone.y2, 10),
            },
        });
        setLoading(false);
        if (result) {
            setShowAddDialog(false);
            setNewZone({ id: '', name: '', x1: '', y1: '', x2: '', y2: '' });
            router.reload({ only: ['config'] });
        }
    }

    async function handleDeleteZone() {
        if (!showDeleteDialog) return;
        setLoading(true);
        await fetchAction(`/admin/safe-zones/${showDeleteDialog.id}`, {
            method: 'DELETE',
        });
        setLoading(false);
        setShowDeleteDialog(null);
        router.reload({ only: ['config'] });
    }

    async function handleResolve() {
        if (!showResolveDialog) return;
        setLoading(true);
        await fetchAction(
            `/admin/safe-zones/violations/${showResolveDialog.id}/resolve`,
            {
                data: { status: resolveAction, note: resolveNote || null },
            },
        );
        setLoading(false);
        setShowResolveDialog(null);
        setResolveNote('');
        router.reload({ only: ['violations'] });
    }

    async function handleKickAndResolve(violation: Violation) {
        setLoading(true);
        await fetchAction(`/admin/players/${violation.attacker}/kick`, {
            data: {
                reason: `PvP violation in safe zone: ${violation.zone_name}`,
            },
        });
        await fetchAction(
            `/admin/safe-zones/violations/${violation.id}/resolve`,
            {
                data: { status: 'actioned', note: 'Player kicked' },
            },
        );
        setLoading(false);
        router.reload({ only: ['violations'] });
    }

    async function handleBanAndResolve(violation: Violation) {
        setLoading(true);
        await fetchAction(`/admin/players/${violation.attacker}/ban`, {
            data: {
                reason: `PvP violation in safe zone: ${violation.zone_name}`,
            },
        });
        await fetchAction(
            `/admin/safe-zones/violations/${violation.id}/resolve`,
            {
                data: { status: 'actioned', note: 'Player banned' },
            },
        );
        setLoading(false);
        router.reload({ only: ['violations'] });
    }

    const filteredViolations = useMemo(() => {
        const result = violations.filter(
            (v) => statusFilter === 'all' || v.status === statusFilter,
        );
        const sorted = [...result];
        sorted.sort((a, b) => {
            let cmp = 0;
            if (vSortKey === 'attacker')
                cmp = a.attacker.localeCompare(b.attacker);
            else if (vSortKey === 'strike_number')
                cmp = a.strike_number - b.strike_number;
            else if (vSortKey === 'occurred_at')
                cmp =
                    new Date(a.occurred_at).getTime() -
                    new Date(b.occurred_at).getTime();
            else if (vSortKey === 'status')
                cmp = a.status.localeCompare(b.status);
            return vSortDir === 'desc' ? -cmp : cmp;
        });
        return sorted;
    }, [violations, statusFilter, vSortKey, vSortDir]);

    const pendingCount = violations.filter(
        (v) => v.status === 'pending',
    ).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Safe Zones" />
            <div className="flex h-full flex-1 flex-col gap-6 overflow-x-auto p-4 lg:p-6">
                {/* Map */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="size-5" />
                                    Zone Map
                                </CardTitle>
                                <CardDescription>
                                    View and draw safe zones on the map
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={
                                        drawingMode ? 'default' : 'outline'
                                    }
                                    size="sm"
                                    onClick={() => setDrawingMode(!drawingMode)}
                                >
                                    {drawingMode ? (
                                        <>
                                            <X className="mr-1.5 size-3.5" />
                                            Cancel Drawing
                                        </>
                                    ) : (
                                        <>
                                            <Pencil className="mr-1.5 size-3.5" />
                                            Draw Zone
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setNewZone({
                                            id: '',
                                            name: '',
                                            x1: '',
                                            y1: '',
                                            x2: '',
                                            y2: '',
                                        });
                                        setShowAddDialog(true);
                                    }}
                                >
                                    <Plus className="mr-1.5 size-3.5" />
                                    Add Zone
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {drawingMode && (
                            <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
                                <MousePointerClick className="size-4 shrink-0" />
                                {
                                    'Click and drag on the map to draw a safe zone rectangle. Press Escape to cancel.'
                                }
                            </div>
                        )}
                        <div className="h-[400px] overflow-hidden rounded-md border">
                            <PzMap
                                mapConfig={mapConfig}
                                hasTiles={hasTiles}
                                zones={zoneOverlays}
                                drawingMode={drawingMode}
                                onZoneDrawn={handleZoneDrawn}
                                selectedZoneId={selectedZoneId}
                                onZoneClick={handleZoneClick}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Zone Configuration */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <ShieldAlert className="size-5" />
                                    Safe Zone Configuration
                                </CardTitle>
                                <CardDescription>
                                    {
                                        'Define PvP-free zones where player damage is prevented'
                                    }
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <Label htmlFor="sz-enabled" className="text-sm">
                                    {config.enabled ? 'Enabled' : 'Disabled'}
                                </Label>
                                <Switch
                                    id="sz-enabled"
                                    checked={config.enabled}
                                    onCheckedChange={toggleEnabled}
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <div className="mb-4">
                            <span className="text-sm text-muted-foreground">
                                {`${String(config.zones.length)} zone(s) defined`}
                            </span>
                        </div>

                        {config.zones.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-4" />
                                        <TableHead>{'ID'}</TableHead>
                                        <TableHead>{'Name'}</TableHead>
                                        <TableHead>{'From (X, Y)'}</TableHead>
                                        <TableHead>{'To (X, Y)'}</TableHead>
                                        <TableHead className="w-16" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {config.zones.map((zone, i) => (
                                        <TableRow
                                            key={zone.id}
                                            className={`cursor-pointer ${selectedZoneId === zone.id ? 'bg-muted/50' : ''}`}
                                            onClick={() =>
                                                setSelectedZoneId(
                                                    selectedZoneId === zone.id
                                                        ? null
                                                        : zone.id,
                                                )
                                            }
                                        >
                                            <TableCell>
                                                <div
                                                    className="size-3 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            ZONE_COLORS[
                                                                i %
                                                                    ZONE_COLORS.length
                                                            ],
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {zone.id}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {zone.name}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {zone.x1}, {zone.y1}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {zone.x2}, {zone.y2}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 text-destructive hover:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowDeleteDialog(
                                                            zone,
                                                        );
                                                    }}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {
                                    'No safe zones defined. Draw a zone on the map or add one manually.'
                                }
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Violations */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="size-5" />
                                    {'PvP Violations'}
                                    {pendingCount > 0 && (
                                        <Badge variant="destructive">
                                            {pendingCount}
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {
                                        'Players who attacked others in safe zones (2+ strikes)'
                                    }
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(
                                    [
                                        ['pending', 'Pending'],
                                        ['actioned', 'Actioned'],
                                        ['dismissed', 'Dismissed'],
                                        ['all', 'All'],
                                    ] as const
                                ).map(([s, label]) => (
                                    <Button
                                        key={s}
                                        variant={
                                            statusFilter === s
                                                ? 'default'
                                                : 'outline'
                                        }
                                        size="sm"
                                        onClick={() => setStatusFilter(s)}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {filteredViolations.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <SortableHeader
                                                column="attacker"
                                                label="Attacker"
                                                sortKey={vSortKey}
                                                sortDir={vSortDir}
                                                onSort={toggleVSort}
                                            />
                                        </TableHead>
                                        <TableHead>{'Victim'}</TableHead>
                                        <TableHead>{'Zone'}</TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="strike_number"
                                                label="Strike #"
                                                sortKey={vSortKey}
                                                sortDir={vSortDir}
                                                onSort={toggleVSort}
                                            />
                                        </TableHead>
                                        <TableHead>{'Location'}</TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="occurred_at"
                                                label="Time"
                                                sortKey={vSortKey}
                                                sortDir={vSortDir}
                                                onSort={toggleVSort}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="status"
                                                label="Status"
                                                sortKey={vSortKey}
                                                sortDir={vSortDir}
                                                onSort={toggleVSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredViolations.map((v) => (
                                        <TableRow key={v.id}>
                                            <TableCell className="font-medium">
                                                {v.attacker}
                                            </TableCell>
                                            <TableCell>{v.victim}</TableCell>
                                            <TableCell>{v.zone_name}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        v.strike_number >= 3
                                                            ? 'destructive'
                                                            : 'secondary'
                                                    }
                                                >
                                                    {v.strike_number}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {v.attacker_x != null ? (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="size-3" />
                                                        {v.attacker_x},{' '}
                                                        {v.attacker_y}
                                                    </span>
                                                ) : (
                                                    '—'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {formatDateTime(v.occurred_at)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        v.status === 'pending'
                                                            ? 'outline'
                                                            : v.status ===
                                                                'actioned'
                                                              ? 'destructive'
                                                              : 'secondary'
                                                    }
                                                >
                                                    {v.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {v.status === 'pending' && (
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={loading}
                                                            onClick={() =>
                                                                handleKickAndResolve(
                                                                    v,
                                                                )
                                                            }
                                                        >
                                                            Kick
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={loading}
                                                            onClick={() =>
                                                                handleBanAndResolve(
                                                                    v,
                                                                )
                                                            }
                                                        >
                                                            Ban
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={loading}
                                                            onClick={() => {
                                                                setResolveAction(
                                                                    'dismissed',
                                                                );
                                                                setResolveNote(
                                                                    '',
                                                                );
                                                                setShowResolveDialog(
                                                                    v,
                                                                );
                                                            }}
                                                        >
                                                            <X className="mr-1 size-3" />
                                                            Dismiss
                                                        </Button>
                                                    </div>
                                                )}
                                                {v.status !== 'pending' &&
                                                    v.resolved_by && (
                                                        <span className="text-xs text-muted-foreground">
                                                            by {v.resolved_by}
                                                        </span>
                                                    )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {statusFilter === 'all'
                                    ? 'No violations found.'
                                    : `No ${statusFilter} violations found.`}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add Zone Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Add Safe Zone'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Define a rectangular area where PvP damage is prevented.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="zone-id">{'Zone ID'}</Label>
                                <Input
                                    id="zone-id"
                                    placeholder="spawn_safezone"
                                    value={newZone.id}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            id: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="zone-name">{'Name'}</Label>
                                <Input
                                    id="zone-name"
                                    placeholder="Spawn Safe Zone"
                                    value={newZone.name}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            name: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="zone-x1">{'X1 (West)'}</Label>
                                <Input
                                    id="zone-x1"
                                    type="number"
                                    placeholder="10000"
                                    value={newZone.x1}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            x1: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="zone-y1">{'Y1 (North)'}</Label>
                                <Input
                                    id="zone-y1"
                                    type="number"
                                    placeholder="10000"
                                    value={newZone.y1}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            y1: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="zone-x2">{'X2 (East)'}</Label>
                                <Input
                                    id="zone-x2"
                                    type="number"
                                    placeholder="10100"
                                    value={newZone.x2}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            x2: e.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="zone-y2">{'Y2 (South)'}</Label>
                                <Input
                                    id="zone-y2"
                                    type="number"
                                    placeholder="10100"
                                    value={newZone.y2}
                                    onChange={(e) =>
                                        setNewZone({
                                            ...newZone,
                                            y2: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowAddDialog(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddZone}
                            disabled={
                                loading ||
                                !newZone.id ||
                                !newZone.name ||
                                !newZone.x1 ||
                                !newZone.y1 ||
                                !newZone.x2 ||
                                !newZone.y2
                            }
                        >
                            <Check className="mr-1.5 size-3.5" />
                            {loading ? 'Adding...' : 'Add Zone'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Zone Confirmation */}
            <Dialog
                open={showDeleteDialog !== null}
                onOpenChange={(open) => !open && setShowDeleteDialog(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Delete Safe Zone'}</DialogTitle>
                        <DialogDescription>
                            {`Are you sure you want to delete the zone "${showDeleteDialog?.name ?? ''}"? PvP will no longer be prevented in this area.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(null)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteZone}
                            disabled={loading}
                        >
                            {loading ? 'Deleting...' : 'Delete Zone'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resolve Violation Dialog */}
            <Dialog
                open={showResolveDialog !== null}
                onOpenChange={(open) => !open && setShowResolveDialog(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Dismiss Violation'}</DialogTitle>
                        <DialogDescription>
                            {`Dismiss the violation from ${showResolveDialog?.attacker ?? ''} against ${showResolveDialog?.victim ?? ''}.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="resolve-note">
                                Note (optional)
                            </Label>
                            <Textarea
                                id="resolve-note"
                                placeholder="Reason for dismissal..."
                                value={resolveNote}
                                onChange={(e) => setResolveNote(e.target.value)}
                                maxLength={500}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowResolveDialog(null)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleResolve} disabled={loading}>
                            {loading ? 'Resolving...' : 'Dismiss'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
